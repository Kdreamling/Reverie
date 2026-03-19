# Reverie 记忆图谱架构评估报告

> 基于 memory-system/gateway 全部核心代码 + Supabase 数据库 schema 的实际审阅

---

## 一、现有架构摸底

### 1.1 数据层现状

| 表 | 记录规模（估） | 核心作用 |
|---|---|---|
| `conversations` | ~300 轮 | 对话原文 + embedding(1024d) + 情绪/话题元数据 |
| `memories` | ~50-100 条 | 分层长期记忆（core_base / core_living / scene / ai_journal） |
| `memory_summaries` | ~20-40 条 | 四维度中期摘要（emotion / event / preference / knowledge） |
| `summaries` | ~若干 | 旧版滑动窗口摘要（仍被 pgvector 搜索使用） |
| `sessions` | ~若干 | 会话管理 + context_summary |

关键点：**memories 表是扁平的**——每条记忆有 layer / base_importance / hits / last_accessed_at，但**没有任何字段描述记忆之间的关系**。

### 1.2 检索链路

```
用户输入
  → hybrid_search()
    → 并行: pgvector 语义搜索(conversations + summaries) + 关键词搜索(trigram)
    → 合并去重
    → rerank（硅基流动 bge-reranker）
    → 按 memory_relevance_score 排序（rerank*0.7 + importance*0.3，含时间衰减）
  → context_builder 按优先级注入：核心记忆 > 全局滑动窗口 > 混合检索 > 中期摘要
  → 总预算 2500 token
```

### 1.3 记忆沉淀链路

```
每轮对话后（BackgroundTask）
  → realtime_micro_summary()：DeepSeek 判断是否值得记录 → 写入 memories 表（去重：cosine > 0.88 跳过）
  → maybe_generate_dimensional_summary()：>=10轮 或 >=3轮+24h → 四维度摘要
  → maybe_generate_session_summary()：>5轮 → session context_summary
```

### 1.4 关键约束

| 约束 | 值 | 影响 |
|---|---|---|
| 检索超时 | 3 秒（hybrid_search） | 图遍历必须在此预算内 |
| 上下文预算 | 2500 token | 图谱注入内容受限 |
| 每日自动记忆上限 | 10 条 | 自动关系提取也需限流 |
| 通道隔离 | claude / deepseek | 图谱数据需按通道隔离 |
| 服务器 | 2核2G（计划升级） | 影响 Neo4j 可行性 |
| 数据库 | Supabase 托管 PostgreSQL | **不支持自定义扩展**（AGE 不可用） |

---

## 二、三方案评估

### 方案 A：引入 Neo4j

**集成难度：高**

需要改动的文件：
- 新增 `graph_service.py`（Neo4j 连接 + Cypher 查询封装）
- `context_builder.py`：检索后增加图展开步骤
- `memory_cycle.py`：微摘要后同步写入 Neo4j 节点/边
- `main.py`：启动时初始化 Neo4j 连接池
- `config.py`：新增 Neo4j 连接配置
- `requirements.txt`：新增 `neo4j` 驱动

**优点**：
- Cypher 查询天生适合多跳遍历，语法优雅
- 图算法丰富（PageRank、社区检测、最短路径）
- 行业主流方案（Graphiti/Zep 都基于 Neo4j）

**致命问题**：
1. **数据分裂**：记忆数据分散在 Supabase + Neo4j 两处，需要双写 + 一致性保证，复杂度陡增
2. **资源开销**：Neo4j 社区版最低需要 ~1-2GB RAM，当前 2核2G 服务器跑不动（即使升级到 4G，Gateway + Neo4j + 系统开销也很紧张）
3. **运维成本**：多一个有状态服务要维护、备份、监控
4. **规模不匹配**：当前 ~300 轮对话、~100 条记忆，预计图谱节点 200-500 个、边 500-2000 条。这个规模用 Neo4j 是**大炮打蚊子**——Neo4j 的优势在百万级节点的复杂遍历，几百个节点的 1-2 跳查询 SQL 毫秒级就能搞定

**结论：不推荐。** 收益与复杂度不成比例。

---

### 方案 B：Supabase PostgreSQL 关系表模拟图 ⭐ 推荐

**集成难度：低-中**

新增两张表：

```sql
-- 结构化记忆节点
CREATE TABLE memory_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,              -- 精炼描述
    category TEXT NOT NULL,             -- event / emotion / preference / knowledge / milestone / promise

    -- 情感详情
    emotion_primary TEXT,               -- 主情绪标签
    emotion_intensity SMALLINT,         -- 强度 1-5
    emotion_trigger TEXT,               -- 触发原因
    emotion_nuance TEXT,                -- 微妙层次描述

    -- 元数据
    occurred_at TIMESTAMPTZ,            -- 发生时间
    time_range_start TIMESTAMPTZ,       -- 持续时间范围（可选）
    time_range_end TIMESTAMPTZ,
    base_importance FLOAT DEFAULT 0.5,
    hits INT DEFAULT 0,
    last_accessed_at TIMESTAMPTZ DEFAULT now(),
    source TEXT DEFAULT 'manual',       -- manual / auto / ai_tool
    scene_type TEXT DEFAULT 'daily',
    model_channel TEXT DEFAULT 'claude',

    -- 向量（复用现有 embedding 基础设施）
    embedding vector(1024),

    -- 关联到原始记忆/对话（可选，保持溯源）
    memory_id UUID REFERENCES memories(id),
    conversation_ids UUID[],

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 记忆关系边
CREATE TABLE memory_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_node_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,

    relation_type TEXT NOT NULL,        -- causal / echo / growth / same_topic / temporal
    strength FLOAT DEFAULT 0.5,         -- 关系强度 0-1
    description TEXT,                   -- 关系描述（如"因为A所以B"）

    created_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(source_node_id, target_node_id, relation_type)
);

-- 索引
CREATE INDEX idx_nodes_category ON memory_nodes(category);
CREATE INDEX idx_nodes_scene ON memory_nodes(scene_type);
CREATE INDEX idx_nodes_channel ON memory_nodes(model_channel);
CREATE INDEX idx_nodes_importance ON memory_nodes(base_importance DESC);
CREATE INDEX idx_nodes_occurred ON memory_nodes(occurred_at DESC);
CREATE INDEX idx_edges_source ON memory_edges(source_node_id);
CREATE INDEX idx_edges_target ON memory_edges(target_node_id);
CREATE INDEX idx_edges_type ON memory_edges(relation_type);
```

**图遍历查询（递归 CTE，1-2 跳）**：

```sql
-- 从种子节点出发，展开 2 跳关联
WITH RECURSIVE graph_walk AS (
    -- 种子节点（语义搜索命中的）
    SELECT id, 0 AS depth
    FROM memory_nodes
    WHERE id = ANY($seed_ids)

    UNION

    -- 沿边展开
    SELECT
        CASE WHEN e.source_node_id = g.id THEN e.target_node_id ELSE e.source_node_id END,
        g.depth + 1
    FROM graph_walk g
    JOIN memory_edges e ON e.source_node_id = g.id OR e.target_node_id = g.id
    WHERE g.depth < 2  -- 最多 2 跳
)
SELECT DISTINCT n.*, gw.depth
FROM graph_walk gw
JOIN memory_nodes n ON n.id = gw.id
ORDER BY gw.depth, n.base_importance DESC;
```

在 200-500 节点规模下，这个查询 **< 5ms**，远在 3 秒超时预算内。

**需要改动的文件**：

| 文件 | 改动内容 | 难度 |
|---|---|---|
| Supabase SQL | 新建 memory_nodes + memory_edges 表 + RPC 函数 | 低 |
| `context_builder.py` | 检索后增加"图展开"步骤：种子节点 → 沿边展开 → 格式化脉络 | 中 |
| `memory_cycle.py` | 可选：微摘要时尝试自动提取关系（Phase 2） | 中 |
| `memories.py`（路由） | 新增 memory_nodes / memory_edges 的 CRUD 接口 | 低 |
| `hybrid_search.py` | 新增 `search_memory_nodes` RPC 调用 | 低 |
| `config.py` | 新增 `graph_enabled` feature flag | 低 |

**优点**：
- **零新基础设施**：完全在 Supabase 内，不需要额外服务
- **pgvector 复用**：memory_nodes 的 embedding 用同一套生成/搜索管道
- **数据一致性**：单一数据源，不存在双写问题
- **渐进式**：可以先只加表和种子数据，不改检索链路；确认数据质量后再接入 context_builder
- **规模匹配**：几百个节点的 1-2 跳查询，SQL 绰绰有余

**代价**：
- 超过 3-4 跳的遍历会变慢（但 Reverie 不需要）
- 没有原生图算法（PageRank 等需要自己实现，但当前不需要）

---

### 方案 C：混合方案 / Apache AGE

**Apache AGE 不可行**：Supabase 托管的 PostgreSQL **不支持安装自定义扩展**。除非迁移到自建 PG，否则 AGE 无法使用。

**其他轻量图引擎**（如 NetworkX 内存图）：
- 可以在 Gateway 进程内用 Python NetworkX 维护一个内存图
- 启动时从 PG 加载节点/边到内存，查询走内存图
- 问题：数据量小时没必要，数据量大时内存占用高；且增加了状态管理复杂度

**结论：不推荐。** AGE 不可用，NetworkX 增加复杂度但收益有限。

---

## 三、推荐方案：B（PostgreSQL 关系表）

### 3.1 理由总结

1. **规模决定一切**：200-500 节点 + 500-2000 边，这是 SQL 的舒适区，不是图数据库的舒适区
2. **零运维增量**：不加服务、不加依赖（除了两张新表）
3. **和现有系统无缝融合**：pgvector 语义搜索 → 命中节点 → SQL 递归展开 → 注入脉络，链路清晰
4. **种子数据友好**：手工精梳的节点/边直接 INSERT，不需要学 Cypher
5. **未来可迁移**：如果规模真的增长到需要图数据库，memory_nodes + memory_edges 的数据结构可以 1:1 导入 Neo4j

### 3.2 与现有表的关系：共存，不替代

```
现有系统（保持不变）          新增图谱层（叠加）
┌─────────────────┐         ┌──────────────────┐
│ conversations    │────────→│ memory_nodes     │ ← 精炼的结构化节点
│ (对话原文)       │  溯源    │ (情感详情/类别)   │
├─────────────────┤         ├──────────────────┤
│ memories         │────────→│ memory_edges     │ ← 节点间关系
│ (分层长期记忆)    │  关联    │ (因果/呼应/成长)  │
├─────────────────┤         └──────────────────┘
│ memory_summaries │              ↑
│ (维度摘要)       │         context_builder
└─────────────────┘         检索时"图展开"
```

- **conversations** 继续存对话原文，不变
- **memories** 继续存分层记忆，微摘要继续写入这里，不变
- **memory_summaries** 继续存维度摘要，不变
- **memory_nodes** 是记忆的"精炼结构化版本"，每个节点可以关联回原始 memory_id 或 conversation_ids
- **memory_edges** 描述节点间关系

这样做的好处：**现有功能完全不受影响**。图谱是一个独立的增强层，通过 feature flag 控制是否启用。

### 3.3 AI 工具调用适配

现有的 `search_memory` / `save_memory` 工具：

- `search_memory`：当 `graph_enabled=True` 时，在现有 hybrid_search 结果基础上，额外做一次图展开，把关联节点也返回
- `save_memory`：继续写入 memories 表（ai_journal 层）。后续可以加一个异步任务，尝试将新记忆与已有图谱节点建立关系（Phase 2）

### 3.4 检索时的"图展开"流程

```python
# context_builder.py 中新增的逻辑（伪代码）

async def graph_expand(seed_memory_ids: list[str], max_depth=2, max_nodes=10):
    """从种子节点出发，沿边展开，返回记忆脉络"""
    if not FEATURE_FLAGS.get("graph_enabled"):
        return []

    # 1. 找到种子记忆关联的 memory_nodes
    seed_nodes = supabase.rpc("find_nodes_by_memory_ids", {"ids": seed_memory_ids})

    # 2. 递归展开 1-2 跳
    expanded = supabase.rpc("graph_walk", {
        "seed_ids": [n["id"] for n in seed_nodes],
        "max_depth": max_depth,
        "max_nodes": max_nodes
    })

    # 3. 格式化为"脉络"文本
    return format_memory_thread(expanded)
```

注入位置：在 context_builder 的优先级 3（混合检索）之后、优先级 4（中期摘要）之前，作为新的优先级 3.5 插入。

---

## 四、分阶段实施建议

### Phase 1：数据层 + 种子数据（1-2 天）
- 在 Supabase 创建 `memory_nodes` + `memory_edges` 表
- 创建 `graph_walk` RPC 函数
- 创建 CRUD API 路由（供前端管理界面 + 种子数据导入用）
- 添加 `graph_enabled` feature flag（默认 false）
- Dream 和 Claude（web）开始手工精梳种子数据

### Phase 2：检索集成（1 天）
- `context_builder.py` 增加图展开逻辑
- `hybrid_search.py` 增加 memory_nodes 的语义搜索
- 打开 feature flag，测试注入效果
- 调整 token 预算分配（给图谱脉络留出空间）

### Phase 3：自动化沉淀（后续迭代）
- `memory_cycle.py` 中新增：对话后异步尝试提取实体关系，写入图谱
- 新记忆写入时，自动与已有节点做语义匹配，建议关系连线
- 衰减/强化机制：定期更新 hits / last_accessed_at，长期未触及的节点降权

### Phase 4：前端可视化（可选）
- 记忆图谱可视化面板（D3.js / vis-network）
- 手动编辑节点/边的管理界面

---

## 五、服务器资源建议

方案 B **不需要升级服务器**。新增两张表 + 几个 RPC 函数，对 Supabase 托管 PG 没有额外资源压力。Gateway 进程本身也不增加内存开销。

如果后续要跑更多异步任务（自动关系提取），建议升级到 **2核4G**，主要是给 Gateway 进程更多余量。但 Phase 1-2 完全不需要。

---

## 六、风险与注意事项

1. **种子数据质量是关键**：图谱的价值 90% 取决于节点和边的质量。自动提取的关系往往噪声大，手工精梳的种子数据才是核心资产
2. **不要过早自动化**：先用手工数据验证图展开对上下文质量的提升，确认有效后再做自动提取
3. **token 预算竞争**：图谱脉络会和现有的混合检索结果竞争 2500 token 预算，需要仔细调整各块的分配比例
4. **边的方向性**：因果关系有方向（A→B），呼应关系无方向。memory_edges 的 source/target 需要约定清楚
5. **去重**：同一对记忆之间可能有多种关系类型（既是因果又是同主题），UNIQUE 约束已覆盖
