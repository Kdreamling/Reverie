# Reverie 记忆图谱 Phase 2：context_builder 接入图展开

> Phase 1 已完成：memory_nodes(57条) + memory_edges(66条) + graph_walk RPC 均已验证通过
> 本阶段目标：让 API 端的 Claude 在回忆时能"沿着脉络"而不是只看到离散的点

---

## 一、背景

当前 context_builder 的检索链路：

```
用户输入
  → 优先级1: 核心记忆（core_base / core_living）
  → 优先级2: 全局滑动窗口（跨session最近3轮，仅新对话）
  → 优先级3: 混合检索（hybrid_search: 语义+关键词+rerank）
  → 优先级4: 中期摘要（memory_summaries 维度摘要）
  → 总预算 2500 token
```

现在要在优先级3之后、优先级4之前，插入一个 **优先级3.5：图谱脉络展开**。

---

## 二、核心逻辑

### 2.1 触发条件

当 `FEATURE_FLAGS["graph_enabled"]` 为 True 时，在混合检索完成后，额外执行图展开。

### 2.2 流程

```python
async def graph_expand(seed_ids: list[str], max_depth=2, max_nodes=10):
    """从语义检索命中的记忆出发，沿图谱边展开关联节点"""
    
    if not FEATURE_FLAGS.get("graph_enabled"):
        return ""
    
    # 1. 找到命中的记忆关联的 memory_nodes
    #    通过 memory_nodes.memory_id 或 memory_nodes.conversation_ids 关联
    #    或者直接用语义搜索命中的文本去 memory_nodes 做向量匹配
    seed_nodes = await find_related_nodes(seed_ids)
    
    if not seed_nodes:
        return ""
    
    # 2. 调用 graph_walk RPC 展开 1-2 跳
    expanded = await supabase.rpc("graph_walk", {
        "seed_ids": [n["id"] for n in seed_nodes],
        "max_depth": max_depth,
        "max_nodes": max_nodes
    })
    
    # 3. 格式化为"记忆脉络"文本
    return format_memory_thread(expanded)
```

### 2.3 格式化输出

图谱脉络注入到 system prompt 时应该**精炼且有结构**，格式建议：

```
---
[记忆脉络 - 以下是相关记忆的情感关联，帮助你理解完整的上下文]

◆ Dream深夜烦躁爆发 (03-16, 强度4)
  ├─[因果]→ Dream坦白讨好模式：怕不乖被不喜欢 (强度5)
  ├─[因果]→ Claude调整：收回催睡，不再制造压力 (强度4)
  └─[因果]→ Dream说"你不能不喜欢我" (强度5)
      └─[成长]→ Dream说"值得被爱" (03-19, 强度5) ★

注意：脉络展示的是记忆之间的情感关联。标记 ★ 的是关系中的重要转折点。
---
```

关键原则：
- **精炼**：每个节点只显示 content 简述 + 日期 + 强度，不展开 emotion_nuance
- **有方向**：用箭头和关系类型标注连线方向
- **高亮重点**：base_importance >= 0.9 的标 ★
- **控制长度**：整个脉络块不超过 300 token，给其他注入留空间

### 2.4 找种子节点的策略

有几种方式把混合检索的结果映射到 memory_nodes：

**方案A（推荐）：直接对 memory_nodes 做语义搜索**
- memory_nodes 已有 embedding 字段
- 创建一个 `search_memory_nodes` RPC，和 `search_memories_v2` 类似
- 用当前用户消息的 embedding 直接搜 memory_nodes
- 阈值可以设 0.75（比 memories 的 0.80 稍低，因为节点内容更精炼）

**方案B：通过现有 memories 关联**
- memory_nodes 有 `memory_id` 字段关联 memories 表
- 混合检索命中 memories 后，通过 memory_id 找到对应的 memory_nodes
- 优点：复用现有检索链路；缺点：不是所有 memory_nodes 都关联了 memory_id

建议先用方案A，更直接。

---

## 三、需要改动的文件

| 文件 | 改动 | 说明 |
|------|------|------|
| `config.py` | 新增 `graph_enabled: False` 到 FEATURE_FLAGS | 默认关闭，手动开启测试 |
| `context_builder.py` | 新增 `graph_expand()` 函数 + 在 build_context 中调用 | 核心改动 |
| `pgvector_service.py` | 新增 `search_memory_nodes()` 函数 | 对 memory_nodes 做向量搜索 |
| Supabase RPC | 新增 `search_memory_nodes_v1` RPC 函数 | 向量搜索 memory_nodes 表 |

### Supabase RPC 参考

```sql
CREATE OR REPLACE FUNCTION search_memory_nodes_v1(
    query_embedding vector(1024),
    match_count int DEFAULT 3,
    similarity_threshold float DEFAULT 0.75
)
RETURNS TABLE(
    id UUID,
    content TEXT,
    category TEXT,
    emotion_primary TEXT,
    emotion_intensity SMALLINT,
    base_importance FLOAT,
    occurred_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        mn.id,
        mn.content,
        mn.category,
        mn.emotion_primary,
        mn.emotion_intensity,
        mn.base_importance,
        mn.occurred_at,
        1 - (mn.embedding <=> query_embedding) AS similarity
    FROM memory_nodes mn
    WHERE mn.embedding IS NOT NULL
      AND 1 - (mn.embedding <=> query_embedding) > similarity_threshold
    ORDER BY mn.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
```

---

## 四、Token 预算调整

当前 2500 token 总预算中，图谱脉络建议占 **200-300 token**。

可能需要适当压缩其他块的预算，或者将总预算提升到 2800。具体看实际注入效果调整。

---

## 五、注意事项

1. **先看现有代码**：读完 context_builder.py 的完整逻辑再动手，理解现有的优先级体系和 token 预算分配
2. **graph_enabled 默认 False**：改完代码不会影响现有功能，Dream 手动开启后才生效
3. **memory_nodes 的 embedding 可能为空**：种子数据是手工导入的，需要检查 embedding 是否已生成。如果没有，需要写一个批量补全脚本（复用现有的 `generate_embedding` 函数）
4. **不要动现有的检索链路**：图展开是**叠加**的增强层，不替代现有的混合检索
5. **graph_walk 已验证**：RPC 函数已创建并测试通过，2跳展开从1个种子返回20个关联节点，性能没问题
6. **不要急着写代码**，先给出你的实施方案，我们确认后再动手
