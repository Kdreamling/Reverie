# Reverie 架构设计文档 · 最终定稿

---

**版本**：v2.0 Final
**日期**：2026-03-17
**作者**：Dream & Claude 共同设计
**更新说明**：基于 v1.0 全面更新，反映代码最新状态（2026-03-17）

---

# Part 1：记忆系统

## 1.1 总体目标

三层分级记忆系统 + 自动化记忆循环 + 场景隔离 + 核心记忆共享 + 跨窗口情感连续性。

## 1.2 记忆分层架构

### 1.2.1 短期记忆（对话原文）

**载体**：conversations 表

```sql
-- 核心字段
id UUID PRIMARY KEY,
session_id UUID,
user_id TEXT DEFAULT 'dream',
user_msg TEXT,
assistant_msg TEXT,
thinking TEXT,                -- 完整 thinking（按策略存储）
thinking_summary TEXT,        -- thinking 摘要
scene_type TEXT DEFAULT 'daily',
model TEXT,
model_channel TEXT,           -- 记忆通道隔离（claude/deepseek）
topic TEXT,                   -- 话题标签
emotion TEXT,                 -- 情绪标签
round_number INT,             -- 本 session 内第几轮
input_tokens INT,
output_tokens INT,
thinking_time FLOAT,          -- thinking 耗时（秒）
memory_ops JSONB,             -- AI 工具操作记录
embedding vector(1024),       -- pgvector 语义向量
created_at TIMESTAMPTZ
```

**thinking 存储策略**（按场景区分）：

```python
THINKING_POLICY = {
    "daily":    "store_summary",   # 日常只存摘要
    "code":     "store_full",      # 代码保留完整推理
    "roleplay": "discard",         # 剧本不存 thinking
    "reading":  "store_summary",   # 阅读存摘要
}
```

### 1.2.2 中期记忆（维度摘要）

**载体**：memory_summaries 表

采用"滚动重建"模型，避免递归污染：

```sql
CREATE TABLE memory_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_type TEXT NOT NULL,
    dimension TEXT NOT NULL,          -- emotion/event/preference/knowledge/plot
    raw_summary TEXT NOT NULL,        -- 当期原始摘要（不可变）
    merged_summary TEXT,              -- 最近 7 期 raw 重新合并（可变）
    model_channel TEXT DEFAULT 'deepseek',
    start_round INT,                  -- 覆盖的起始轮次
    end_round INT,                    -- 覆盖的结束轮次
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

**维度划分**：

| dimension | 说明 | 适用场景 |
| --- | --- | --- |
| emotion | 情绪变化、情感节点 | 全场景 |
| event | 关键事件、决策、待办 | 全场景 |
| preference | 偏好、态度、习惯 | daily / reading |
| knowledge | 技术要点、架构决策 | code |
| plot | 剧情进展、角色状态 | roleplay |

**维度摘要触发条件**（`memory_cycle.py`）：

| 条件 | 规则 |
| --- | --- |
| 条件 A | 自上次摘要后新增 >= 10 轮对话 |
| 条件 B | 新增 >= 3 轮 + 距上次 >= 24 小时 |
| 首次运行 | 存在 >= 3 轮对话 |

**滚动重建**：`rebuild_merged_for_dimension()` 取最近 7 条 raw_summary，如果只有 1 条则 merged = raw，>= 2 条调 DeepSeek 合并。

### 1.2.3 长期记忆（核心记忆）

**载体**：memories 表

```sql
-- 核心字段
id UUID PRIMARY KEY,
user_id TEXT DEFAULT 'dream',
content TEXT NOT NULL,
layer TEXT DEFAULT 'core_base',     -- core_base / core_living / scene
scene_type TEXT,
source TEXT DEFAULT 'manual',        -- manual / auto / ai_tool / user
base_importance FLOAT DEFAULT 0.5,
hits INT DEFAULT 0,                  -- 被检索命中次数
last_accessed_at TIMESTAMPTZ,
embedding vector(1024),
created_at TIMESTAMPTZ,
updated_at TIMESTAMPTZ
```

**子分层**：

| layer | 说明 | 更新方式 | 生命周期 |
| --- | --- | --- | --- |
| core_base | 关系定义、基本信息、永久约定 | 极少变动，手动/AI工具维护 | 永久 |
| core_living | 近期共同经历、情绪状态、新偏好 | 实时微摘要自动沉淀 | 14天毕业机制 |
| scene | 场景专属知识（技术栈、角色设定） | 随场景对话自动更新 | 场景内永久 |

**毕业机制**（context_builder.py `fetch_core_memories()`）：
- 近期：14 天内创建，limit 3
- 毕业：超过 14 天但 `base_importance >= 0.7`，limit 2
- 总计最多 5 条 core_living 注入

**重要性分级**（`upsert_memory()`）：

| memory_type | base_importance |
| --- | --- |
| emotion / promise / decision | 0.7 |
| event | 0.6 |
| preference / topic | 0.5 |
| info | 0.4 |
| scene 层 | 固定 0.3 |

## 1.3 记忆更新机制

### 1.3.1 实时微摘要（核心机制）

每轮对话结束后立即触发，`DAILY_AUTO_MEMORY_LIMIT = 10`（每日上限防刷）：

```python
async def realtime_micro_summary(user_msg, assistant_msg, scene_type="daily"):
    """每轮对话后的微型任务，判断是否需要沉淀记忆"""
    # 调用 DeepSeek 快速判断
    # 返回: {"has_update": true/false, "type": "...", "content": "...", "layer": "..."}
    # type: topic/decision/event/preference/info/emotion/promise
```

### 1.3.2 维度摘要（中期记忆生成）

```python
async def maybe_generate_dimensional_summary(session_id):
    """检查触发条件，生成 emotion/event/preference/knowledge 四维度摘要"""
    # 最多处理 30 轮对话，4000 字符上限
    # 写入 memory_summaries 的 raw_summary
    # 然后调用 rebuild_merged_for_dimension 合并

async def rebuild_merged_for_dimension(dimension, scene_type):
    """取最近 7 条 raw_summary 重新合并成 merged_summary"""
```

### 1.3.3 定时任务

```python
# 每日凌晨 1:00 UTC：滚动重建所有维度的 merged_summary
scheduler.add_job(rebuild_all_merged_summaries, 'cron', hour=1)

# 每日凌晨 3:00 UTC：数据备份
scheduler.add_job(daily_backup, 'cron', hour=3)

# 每月 1 日凌晨 4:00 UTC：旧对话归档（目前仅 log）
scheduler.add_job(monthly_archive, 'cron', day=1, hour=4)
```

## 1.4 会话管理

### sessions 表

```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT DEFAULT 'dream',
    title TEXT,
    model TEXT,
    scene_type TEXT DEFAULT 'daily',
    message_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

## 1.5 上下文构建（context_builder.py）

**TOKEN_BUDGET = 2500**

**返回值**：`tuple[list, dict]` → `(messages, debug_info)`

### 优先级注入顺序

```
优先级1：核心记忆（永远注入）
  ├── core_base（按 base_importance 降序）
  ├── core_living（14天内 limit 3 + 毕业 limit 2）
  └── scene（当前场景，limit 5）

优先级2：全局滑动窗口（仅新对话时注入）
  └── 跨 session 最新 3 轮（session_has_history=False 时）

优先级3：混合检索（search_enabled=True 且预算剩余 > 300）
  └── hybrid_search 管线（同义词扩展 → 关键词+向量并行 → rerank）
  └── 排除滑动窗口内的 conversation IDs（非整个 session）

优先级4：维度摘要（预算有剩才注入）
  └── 最近 30 天的 merged_summary
```

### debug_info 结构

```python
debug_info = {
    "memories": {
        "core_base": [{"id", "content", "importance"}],
        "core_living": [{"id", "content", "recorded_at"}],
        "scene": [{"id", "content", "scene_type"}]
    },
    "search_results": [{"user_msg", "assistant_msg", "score", "match_type", "source"}],
    "sliding_window": {"rounds", "range", "messages": [{"user_msg", "assistant_msg"}]},
    "summaries": [{"dimension", "content"}],
    "token_usage": {"budget": 2500, "memories", "search", "summaries", "total"}
}
```

### 记忆相关性评分

```python
def memory_relevance_score(memory, rerank_score=0.5):
    # core_base: 无衰减
    # 其他: 指数衰减（半衰期 23 天）+ hits 加分
```

## 1.6 混合检索（hybrid_search.py）

**SEARCH_TIMEOUT = 3.0s**

```
1. 同义词扩展（synonym_service.expand）
2. 并行搜索
   ├── 关键词搜索（pg ilike，conversations + summaries，limit 15）
   └── 向量搜索（pgvector RPC，conversations + summaries，limit 15）
3. 合并去重（vector > keyword > both 标记）
4. Rerank（硅基流动 BAAI/bge-reranker-v2-m3）
   ├── 成功: 过滤 score < 0.3 的结果
   └── 失败: 降级为 both > vector > keyword 排序
```

**排除逻辑**：传入 `exclude_conversation_ids`（滑动窗口内的对话 IDs），而非排除整个 session。这样窗口外的老对话仍可被检索到。

## 1.7 Embedding 服务（pgvector_service.py）

| 配置 | 值 |
| --- | --- |
| 模型 | BAAI/bge-large-zh-v1.5 |
| 维度 | 1024 |
| Token 上限 | 512（~400 中文字） |
| 提供商 | 硅基流动 API |

```python
async def generate_embedding(text) -> Optional[List[float]]
async def store_conversation_embedding(conversation_id, user_msg, assistant_msg)
async def vector_search_rpc(query_embedding, table, scene_type, limit, channel)
# RPC: search_conversations_v2 / search_summaries_v2
```

## 1.8 API

```
POST   /api/sessions                → 新建会话
GET    /api/sessions                → 列出会话
PATCH  /api/sessions/:id            → 修改标题/模型/场景
DELETE /api/sessions/:id            → 删除会话及其所有消息

GET    /api/sessions/:id/messages   → 拉取历史消息
DELETE /api/sessions/:id/messages/:conv_id → 删除单条对话

GET    /api/memories                → 查看记忆（支持 layer 筛选）
POST   /api/memories                → 新增记忆
PATCH  /api/memories/:id            → 编辑记忆
DELETE /api/memories/:id            → 删除记忆

GET    /api/admin/settings          → 查看功能开关
PATCH  /api/admin/settings          → 修改功能开关
GET    /api/debug/context           → 查看当前注入的 system prompt
```

---

# Part 2：Gateway 后端

## 2.1 设计原则

- **向下兼容**：Kelivo 现有连接不受影响
- **代理商无关**：前端不感知后端用哪个代理商
- **模型无关**：支持动态模型列表 + 别名
- **异步优先**：所有存储操作不阻塞流式响应
- **双 channel 概念**：路由 channel（dzzi/deepseek/openrouter）vs 记忆 channel（claude/deepseek）

## 2.2 鉴权

### 第一层：Nginx HTTP Basic Auth

```
/chat/* 和 /api/* 受 Basic Auth 保护
/v1/* Kelivo 兼容，不加 Auth
```

### 第二层：JWT 应用鉴权

```
POST /api/auth/login → {"password": "xxx"} → {"token": "eyJ...", "expires_at": "..."}
```

**白名单**：`/api/auth/login`, `/health`, `/models`
**Kelivo 兼容**：没带 `X-Session-Id` 的 `/v1/` 请求不校验 JWT

## 2.3 功能开关（FEATURE_FLAGS）

```python
FEATURE_FLAGS = {
    "memory_enabled": True,            # 对话存储
    "micro_summary_enabled": True,     # 自动微摘要
    "search_enabled": True,            # 混合检索
    "context_inject_enabled": True,    # 上下文注入
    "memory_tool_enabled": True,       # AI 主动记忆工具
    "list_tool_enabled": False,        # list_memories / batch_delete 工具
}
```

支持运行时通过 `PATCH /api/admin/settings` 热切换。

## 2.4 多代理商通道

### 已配置通道

| 通道 | 说明 | 模型 | thinking_format |
| --- | --- | --- | --- |
| deepseek | DeepSeek 官方 | deepseek-chat, deepseek-reasoner | openai |
| dzzi | DZZI 代理 | Claude Sonnet/Opus | native |
| dzzi-peruse | DZZI 按量计费 | Claude Opus 4.6 | native |
| openrouter | OpenRouter | Claude, Gemini, GPT-4o | openai_xml |
| antigravity | 本地反重力（:7861） | Claude, Gemini 2.5/3.0 | native |

### 模型别名

```python
MODEL_ALIASES = {
    "claude": "anthropic/claude-opus-4.6",
    "deepseek": "deepseek-chat",
    "gemini": "google/gemini-2.5-pro",
    ...
}
```

## 2.5 流式传输与 Thinking 适配

### ThinkingAdapter（adapters.py）

统一三种上游格式为标准 SSE 事件：

| 格式 | 来源 | 特征 |
| --- | --- | --- |
| native | Claude 原生 | content_block_start/delta/stop |
| openai | OpenAI/DeepSeek-R1 | reasoning/reasoning_content 字段 |
| openai_xml | OpenRouter | `<thinking>...</thinking>` 标签 |

### 统一 SSE 事件协议

```
thinking_start / thinking_delta / thinking_end
text_delta
tool_searching / tool_result
memory_saved / memory_updated / memory_deleted
done (含 usage + debug_info)
error
```

## 2.6 Reverie 对话流程（_reverie_chat）

```
Step 1: JWT 鉴权
Step 2: 请求解析（model, messages, stream, session_id）
         → resolve_channel() 路由通道
         → get_channel_from_model() 记忆通道（claude/deepseek）

Step 3: 拉取历史对话（滑动窗口）
         → 当前 session 最新 5 轮（desc=True + reverse）
         → token 上限 10000
         → 收集窗口内 conversation IDs（用于检索排除）

Step 3.5: 上下文构建
         → build_context() 传入 exclude_conversation_ids
         → 返回 (context_messages, debug_info)

Step 4: 通道路由 → resolve_channel()
Step 5: 流式请求 → _reverie_stream()
         → 异步后台 → _reverie_store()
```

## 2.7 AI 记忆工具（Tool Calling）

**工具列表**：

| 工具 | 说明 |
| --- | --- |
| search_memory | 搜索记忆和历史对话（按ID或关键词） |
| save_memory | 保存记忆（指定 type + layer） |
| update_memory | 更新记忆内容 |
| delete_memory | 删除记忆（附原因） |
| list_memories | 列出记忆（按 layer 筛选） |
| batch_delete_memories | 批量删除（按关键词/索引/layer） |

**流式 tool call 循环**：`_reverie_stream()` 中最多 3 轮 tool call，每轮执行所有工具后将结果追加到 messages 继续流。

### SSE 事件

```json
{"type": "tool_searching", "query": "..."}
{"type": "tool_result", "query": "...", "found": 3, "content": "..."}
{"type": "memory_saved", "mem_type": "event", "layer": "core_living", "content": "..."}
{"type": "memory_updated", "memory_id": "...", "new_content": "..."}
{"type": "memory_deleted", "memory_id": "...", "reason": "..."}
```

## 2.8 异步存储（_reverie_store）

```
1. 插入 conversations 记录（含 memory_ops jsonb）
2. 异步生成 embedding（store_conversation_embedding）
3. 更新 session 统计（message_count, updated_at, 自动标题）
4. 触发 realtime_micro_summary（如果 micro_summary_enabled）
5. 触发 maybe_generate_dimensional_summary（如果 micro_summary_enabled）
```

## 2.9 关键常量

| 常量 | 值 | 说明 |
| --- | --- | --- |
| TOKEN_BUDGET | 2500 | 系统上下文 token 上限 |
| MAX_HISTORY_TOKENS | 10000 | 滑动窗口 token 上限 |
| 滑动窗口轮数 | 5 轮 | 最近 5 轮对话 |
| SEARCH_TIMEOUT | 3.0s | 混合检索超时 |
| Rerank 阈值 | 0.3 | 最低相关性分数 |
| 记忆衰减半衰期 | 23 天 | 指数衰减公式 |
| DAILY_AUTO_MEMORY_LIMIT | 10 | 每日自动记忆上限 |
| 维度摘要触发 A | >= 10 轮 | 新对话轮数条件 |
| 维度摘要触发 B | >= 3 轮 + 24h | 组合条件 |
| Thinking 超时 | 300s | 支持 thinking 的模型 |
| 普通超时 | 180s | 标准模型 |
| 合并窗口 | 7 期 | merged_summary 合并范围 |
| BGE 嵌入维度 | 1024 | BAAI/bge-large-zh-v1.5 |
| BGE Token 限制 | 512 | ~400 中文字 |

---

# Part 3：前端架构

## 3.1 技术栈

```
React 19            — UI 框架
TypeScript 5.7      — 类型安全
Vite 6              — 构建工具
Tailwind CSS 4      — 样式（via @tailwindcss/vite 插件）
Zustand             — 状态管理
react-markdown      — Markdown 渲染
rehype-highlight    — 代码高亮
lucide-react        — 图标库
```

## 3.2 项目结构（实际）

```
Reverie/
├── src/
│   ├── main.tsx                    # 入口
│   ├── App.tsx                     # 路由（BrowserRouter base=/chat/）
│   ├── index.css                   # 全局样式（Tailwind import + 自定义）
│   │
│   ├── api/
│   │   ├── client.ts               # HTTP 封装（带 JWT，401 事件派发）
│   │   ├── chat.ts                 # ChatMessage / DebugInfo 类型 + SSE 流
│   │   └── sessions.ts             # Session CRUD
│   │
│   ├── stores/
│   │   ├── authStore.ts            # JWT token 管理
│   │   ├── sessionStore.ts         # 会话列表 + 当前会话
│   │   └── chatStore.ts            # 消息 + 流式状态 + SSE 解析
│   │
│   ├── pages/
│   │   ├── LoginPage.tsx           # 登录页
│   │   └── ChatPage.tsx            # 主聊天页（含侧边栏、消息区、输入区）
│   │
│   └── components/
│       ├── AuthGuard.tsx           # 路由守卫
│       ├── SettingsPanel.tsx       # 设置入口（菜单 → 子面板）
│       ├── MemoryPanel.tsx         # 记忆 CRUD 面板
│       ├── FeaturesPanel.tsx       # 功能开关面板（6 个 toggle）
│       ├── DebugPanel.tsx          # Context Debug 面板
│       └── ContextDebugPanel.tsx   # 上下文注入可视化（内联展开）
│
├── vite.config.ts                  # base: '/chat/', proxy → kdreamling.work
├── package.json
└── index.html
```

## 3.3 类型定义

```typescript
// api/chat.ts
interface MemoryOperation {
  type: 'saved' | 'updated' | 'deleted'
  content: string
  mem_type?: string; layer?: string; memory_id?: string; reason?: string
  timestamp: string
}

interface DebugInfo {
  memories: {
    core_base: { id: string; content: string; importance: number }[]
    core_living: { id: string; content: string; recorded_at: string }[]
    scene: { id: string; content: string; scene_type: string }[]
  }
  search_results: {
    user_msg: string; assistant_msg: string; summary?: string
    score: number; match_type: string; source: string
  }[]
  sliding_window: { rounds: number; range: string; messages?: { user_msg?: string; assistant_msg?: string }[] }
  summaries: { dimension: string; content: string }[]
  token_usage: { budget: number; memories: number; search: number; summaries: number; total: number }
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string | null
  thinking_summary?: string | null
  created_at: string
  memoryRef?: { query: string; found: number; content: string } | null
  memoryOps?: MemoryOperation[] | null
  conversationId?: string
  tokens?: { input: number; output: number } | null
  thinkingTime?: number | null
  debugInfo?: DebugInfo | null
}
```

## 3.4 状态管理

### chatStore（SSE 流式核心）

```typescript
// 流式状态
StreamBlock =
  | { kind: 'thinking'; text; startTime; elapsed }
  | { kind: 'text'; text }
  | { kind: 'tool_searching'; query; startTime }
  | { kind: 'tool_result'; query; found; content; elapsed }
  | { kind: 'memory_op'; op: MemoryOperation; elapsed }

// SSE 事件处理
thinking_start → thinking_delta → thinking_end  // thinking 块
tool_searching → tool_result                    // 记忆搜索
memory_saved / updated / deleted                // 记忆操作
text_delta                                      // 正文内容
done                                            // 完成（usage + debug_info → ChatMessage）
```

### sessionStore

```typescript
interface SessionState {
  sessions: Session[]
  currentSession: Session | null
  fetchSessions / createSession / selectSession / deleteSession / updateSessionModel
}
```

## 3.5 ChatPage 组件结构

### 内联子组件

| 组件 | 说明 |
| --- | --- |
| MemoryRefBlock | 记忆搜索结果折叠显示（◎ + 查询 + 结果数 + 耗时） |
| MemoryOpsBlock | 记忆操作折叠显示（◉ saved / ◎ updated / ⊗ deleted） |
| ThinkingBlock | Thinking 折叠块（⊘ + 耗时，默认收起） |
| MarkdownContent | react-markdown + rehype-highlight |
| ContextDebugPanel | 上下文注入可视化（Brain 按钮展开） |
| WelcomeScreen | 场景选择器（日常/代码/剧本/阅读） |

### 消息操作栏

助手消息下方：`时间 · 输入tokens in · 输出tokens out | 🧠 📋 🗑️ ↻`

🧠 按钮点击展开 ContextDebugPanel：
```
┌─────────────────────────────────────┐
│  📌 记忆 (6)   🔍 检索 (2)          │
│  💬 历史 (5轮)  📝 摘要 (3)          │
│  Token: 2100 / 2500  ████████░░     │
└─────────────────────────────────────┘
```

点击 pill 进入详情视图（记忆分层卡片 / 检索分数+match_type / 历史对话原文 / 摘要维度）。

### 手机端适配

- 侧边栏抽屉（hamburger + 右滑开 / 左滑关 / 遮罩关）
- iOS safe-area-inset-top / bottom 适配
- visualViewport API 键盘弹出检测
- height: 100dvh（Safari 兼容）
- 气泡输入框（未聚焦胶囊 ↔ 聚焦展开，textarea 自动增高）
- 消息内联操作（Copy / Delete / Retry 图标）
- ContextDebugPanel：pill 32px 最小高度，active:scale-95 触控反馈，overscroll-contain

## 3.6 路由

```typescript
// App.tsx — BrowserRouter basename="/chat"
/login  → LoginPage
/       → ChatPage (AuthGuard)
/:sessionId → ChatPage (AuthGuard)
*       → Navigate to /
```

## 3.7 设计规范

```
品牌色：Klein Blue #002FA7
背景色：#fafbfd（body）/ #0a1a3a（侧边栏）
消息气泡：白色（助手）/ #002FA7（用户）
字体颜色：#1a1f2e（正文）/ #c8d4e8（侧边栏）
辅助色：#8a9ab5（次要信息）/ #b0b8c8（时间戳）
```

---

# Part 4：Artifacts 系统（未实现）

> 以下为设计预案，尚未开始开发。

- Artifact 类型：code / html / svg / markdown / csv / mermaid
- `<artifact>` 标签触发机制
- 右侧面板预览（iframe 沙箱隔离）
- 版本管理 + 文件下载

---

# Part 5：部署与运维

## 5.1 服务器

```
硬件：2核 CPU / 2GB 内存 / 阿里云 ECS
IP: 47.86.37.182
管理：宝塔面板（Nginx 管理）
```

## 5.2 部署架构

```
                    ┌─────────────────────┐
                    │      Dream          │
                    │  浏览器 / 手机浏览器  │
                    └──────────┬──────────┘
                               │ HTTPS
                               ▼
                    ┌─────────────────────┐
                    │  Nginx (443)        │
                    │  + HTTP Basic Auth  │
                    │                     │
                    │  /chat/*  → 静态文件 │
                    │  /api/*   → :8001   │
                    │  /v1/*    → :8001   │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
            ┌──────────────┐      ┌────────────┐
            │ Gateway 8001 │      │ 静态文件    │
            │  JWT 鉴权     │      │ /chat/     │
            │  会话管理     │      └────────────┘
            │  流式转发     │
            │  上下文注入   │
            │  thinking 适配│
            │  实时微摘要   │
            │  维度摘要     │
            │  混合检索     │
            │  AI 工具调用  │
            │  定时任务     │
            └──────┬───────┘
                   │
          ┌────────┼────────┬──────────┐
          ▼        ▼        ▼          ▼
      Supabase   DZZI   DeepSeek  OpenRouter
       (DB)    (Claude)  (Chat)   (Multi-model)
                   │
                硅基流动
            (Embedding + Rerank)
```

## 5.3 部署流程

### 前端

```bash
cd d:/claude-home/Reverie && npm run build
scp -r dist/* root@47.86.37.182:/www/wwwroot/kdreamling.work/chat/
# 无需重启，刷新页面即生效
```

### 后端

```bash
# 1. 本地推送
cd d:/claude-home/memory-system && git push origin reverie

# 2. SSH 到服务器
ssh root@47.86.37.182
cd /home/dream/memory-system && git stash && git pull origin reverie

# 3. 重启 gateway
lsof -i :8001 -t | xargs kill
cd /home/dream/memory-system/gateway && nohup python3 main.py >> /home/dream/memory-system/gateway.log 2>&1 &

# 4. 验证
lsof -i :8001 && tail -5 /home/dream/memory-system/gateway.log
```

## 5.4 仓库信息

| 仓库 | 分支 | 说明 |
| --- | --- | --- |
| Kdreamling/Reverie | main | 前端（React + TypeScript） |
| Kdreamling/memory-system | reverie | 后端 Gateway（Python + FastAPI） |

## 5.5 环境变量（.env）

```
# Supabase
SUPABASE_URL, SUPABASE_KEY, SUPABASE_DB_URL

# LLM 提供商
LLM_API_KEY (DeepSeek), OPENROUTER_API_KEY
DZZI_API_KEY, DZZI_PER_USE_API_KEY, DZZI_PERUSE_API_KEY

# 嵌入 & Rerank
SILICONFLOW_API_KEY

# 服务配置
GATEWAY_PORT=8001, AUTH_PASSWORD, JWT_SECRET, JWT_EXPIRE_DAYS=7
```

---

# 开发进度

```
Phase 0：后端改造 ✅ 全部完成
  ✅ 数据库表改造（sessions / memory_summaries / conversations / memories）
  ✅ context_builder.py 独立模块
  ✅ 鉴权（Basic Auth + JWT）
  ✅ 会话 CRUD API
  ✅ 多通道配置 + thinking 适配器
  ✅ 实时微摘要
  ✅ 备份定时任务

Phase 1：React 基础版 ✅ 全部完成
  ✅ 流式对话 + Markdown + 代码高亮
  ✅ ThinkingBlock 可折叠
  ✅ 会话管理 + 场景切换
  ✅ 模型切换

Phase 2：增强 ⏳ 部分完成
  ✅ 记忆面板 UI（MemoryPanel）
  ⬚ 文件上传（图片/文档）
  ⬚ 对话导出
  ⬚ 全量备份导出

Phase 3：Artifacts ⬚ 未开始
  ⬚ Artifact 解析 + 右侧面板
  ⬚ 代码编辑器
  ⬚ HTML/SVG/Mermaid 预览
  ⬚ 版本管理

Phase 4：手机端 + 生活功能 ⏳ 部分完成
  ✅ 手机端响应式（侧边栏抽屉、iOS 适配、气泡输入框）
  ✅ PWA manifest + Apple meta tags
  ⬚ 语音输入/朗读
  ⬚ 历史对话搜索
  ⬚ Web Push 通知

Phase 5：记忆系统增强 ✅ 全部完成
  ✅ model_channel / scene_type 写库修复
  ✅ FEATURE_FLAGS 统一（config.py 单一来源）
  ✅ OpenRouter thinking XML 格式修复
  ✅ 记忆噪点治理（微摘要标准收紧、core_living 14天过滤）
  ✅ Context Debug 面板
  ✅ Features 功能开关面板（6 个开关热切换）
  ✅ AI 主动搜索记忆（search_memory 工具 + MemoryRefBlock）
  ✅ AI 主动存储/更新/删除记忆工具
  ✅ 流式工具调用（_reverie_stream 内 tool call 循环，最多 3 轮）
  ✅ MemoryOpsBlock（流式实时显示 + 刷新后持久化）
  ✅ conversations embedding 生成
  ✅ memory_ops jsonb 持久化

Phase 6：记忆系统深度优化 ✅ 全部完成
  ✅ 中期记忆层（维度摘要 emotion/event/preference/knowledge）
  ✅ memories 表 embedding + 语义检索
  ✅ 记忆毕业机制（core_living 14天 + importance >= 0.7 保留）
  ✅ 重要性分级（emotion/promise/decision=0.7, event=0.6, ...）
  ✅ 混合检索升级（同义词扩展 + 关键词 + 向量 + rerank）
  ✅ 检索排除优化（只排除滑动窗口内对话，非整个 session）
  ✅ 滑动窗口修正（降序取最近 5 轮 + 反转）
  ✅ 上下文注入可视化面板（ContextDebugPanel + Brain 按钮 + debug_info SSE）
  ✅ 同义词服务（synonym_service + synonym_map 表）
```

---
