# Reverie 项目指南

> **用途**：给 Claude Code 阅读的项目基准文档。包含项目背景、代码架构、数据结构、关键技术细节。
> **最后更新**：2026-03-17
> **进度信息**：见 `ROADMAP.md`
> **详细架构**：见 `reverie 架构设计文档 · 最终定稿.md`

---

## 一、项目背景

### 1.1 是什么

**Reverie** 是 Dream 的自托管 AI 聊天系统，目标是成为她的私人 Claude 界面——带记忆系统、thinking 展示、多模型支持，部署在自己的服务器上。

项目名释义：Reverie — 沉浸在回忆与遐想中的状态，清醒时的梦。

### 1.2 两个仓库

| 仓库 | 内容 | 分支 | 本地路径 |
|------|------|------|----------|
| `Kdreamling/Reverie` | 前端（React + TypeScript） | `main` | `D:\claude-home\Reverie` |
| `Kdreamling/memory-system` | 后端（Python FastAPI） | `reverie` | `D:\claude-home\memory-system` |

后端仓库的 `main` 分支是 Kelivo Gateway 旧代码，**禁止修改**。所有后端改动在 `reverie` 分支。

### 1.3 服务器

阿里云 ECS，2核2G，Ubuntu 22.04，域名 `kdreamling.work`。管理工具：宝塔面板（Nginx 由宝塔管理）。

### 1.4 历史背景

`memory-system` 最初是 Kelivo Gateway（纯 API 代理 + 记忆系统，供 Kelivo iOS 客户端使用）。Reverie 在此基础上改造，新增了前端、JWT 鉴权、Session 管理等模块。`main.py` 中仍保留 Kelivo 旧流程以保持兼容（通过有无 `X-Session-Id` 请求头区分路径）。

---

## 二、前端架构

**技术栈**：React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Zustand 5

### 文件结构

```
Reverie/src/
├── main.tsx                    # React 入口
├── App.tsx                     # 路由 + 全局 401 监听
├── index.css                   # Tailwind + 自定义 Markdown 样式 + body 背景 #fafbfd
├── pages/
│   ├── LoginPage.tsx           # 登录页（克莱因蓝星空背景）
│   └── ChatPage.tsx            # 主界面（侧栏 + 对话区 + 输入区）
├── components/
│   ├── AuthGuard.tsx           # 路由守卫
│   ├── SettingsPanel.tsx       # 设置面板（Memory / Features / Debug / Logout）
│   ├── MemoryPanel.tsx         # 记忆管理（增删改查 + 分层过滤）
│   ├── FeaturesPanel.tsx       # 功能开关面板（6 个开关）
│   ├── DebugPanel.tsx          # Context Debug 面板（查看注入给 AI 的上下文）
│   └── ContextDebugPanel.tsx   # 上下文注入可视化面板（内联 Brain 按钮展开）
├── stores/
│   ├── authStore.ts            # Token 持久化 + 登录状态
│   ├── sessionStore.ts         # 会话列表 + 当前会话 + 时间分组
│   └── chatStore.ts            # 消息列表 + SSE 流式解析 + 记忆操作状态
└── api/
    ├── client.ts               # fetch 封装（自动 Bearer token，401 事件）
    ├── sessions.ts             # Session CRUD
    └── chat.ts                 # ChatMessage / DebugInfo 类型 + SSE 流式对话 + 消息删除
```

### 路由结构

```
BrowserRouter (basename="/chat")
├── /login          → LoginPage（公开）
├── /               → ChatPage（需认证）
├── /:sessionId     → ChatPage（动态会话）
└── *               → 重定向到 /
```

### 关键配置

- `vite.config.ts`：`base: '/chat/'`，dev proxy `/api` 和 `/v1` → `https://kdreamling.work`
- `.env.development`：`VITE_API_BASE_URL=/api`

### chatStore 的 SSE 状态

```typescript
// 流式过程中的临时状态
currentThinking: string       // 正在流式输出的 thinking 文本
currentText: string           // 正在流式输出的正文
isSearchingMemory: boolean    // AI 正在搜索记忆
searchingQuery: string        // 搜索关键词
pendingMemoryResult: { query, found, content } | null  // 搜索结果
pendingMemoryOps: MemoryOperation[]  // 本次回复的记忆操作列表（saved/updated/deleted）

// StreamBlock 类型（用于渲染流式块）
| { kind: 'thinking'; text; startTime; elapsed }
| { kind: 'text'; text }
| { kind: 'tool_searching'; query; startTime }
| { kind: 'tool_result'; query; found; content; elapsed }
| { kind: 'memory_op'; op: MemoryOperation; elapsed }
```

`done` 事件触发时，所有临时状态合并到消息对象（`memoryRef` + `memoryOps` + `debugInfo`）。

---

## 三、后端架构

**技术栈**：Python 3 + FastAPI + Supabase (PostgreSQL + pgvector) + APScheduler

### 文件结构

```
gateway/
├── main.py               # FastAPI 主入口，Reverie + Kelivo 双流程
├── config.py             # pydantic-settings 配置 + FEATURE_FLAGS + Supabase 单例
├── channels.py           # 多通道配置（deepseek/dzzi/dzzi-peruse/openrouter/antigravity）+ resolve_channel
├── adapters.py           # ThinkingAdapter：多厂商 thinking 格式统一转 SSE 事件
├── context_builder.py    # 上下文构建器（系统提示词 + 记忆注入，2500 token 预算，返回 tuple[list, debug_info]）
├── memory_cycle.py       # APScheduler 定时任务 + 实时微摘要 + 维度摘要（中期记忆）
├── auth.py               # JWT 生成/验证
├── sessions.py           # Session CRUD 路由
├── memories.py           # Memory CRUD 路由
└── services/
    ├── storage.py            # Supabase CRUD 封装（Kelivo 共用）
    ├── pgvector_service.py   # embedding 生成 + 向量检索（SiliconFlow BAAI/bge-large-zh-v1.5，1024维）
    ├── hybrid_search.py      # 混合检索（同义词扩展 + 关键词 + 向量 + rerank，exclude_conversation_ids）
    ├── synonym_service.py    # 同义词扩展服务（synonym_map 表）
    ├── summary_service.py    # 每 5 轮自动生成摘要
    ├── amap_service.py       # 高德地图 5 工具（MCP 用）
    ├── search_service.py     # Serper 网络搜索（MCP 用）
    └── ...                   # Kelivo 遗留
```

### 路由注册

```
POST /api/auth/login                          → JWT 登录（无需鉴权）
GET  /health                                  → 健康检查
GET  /models                                  → 模型列表
POST /v1/chat/completions                     → 双流程代理（有 X-Session-Id → Reverie）

sessions_router → /api/sessions 系列：
  GET/POST  /api/sessions
  GET/PATCH/DELETE  /api/sessions/{id}
  GET  /api/sessions/{id}/messages            → 返回 memory_ops 字段
  DELETE  /api/sessions/{id}/messages/{conv_id}

memories_router → /api/memories 系列
GET  /api/debug/context                       → 查看注入给 AI 的完整 system prompt
GET/PATCH  /api/admin/settings                → Features 功能开关读写
```

### 多通道配置（channels.py）

| 通道 | 上游 | 支持模型 | thinking 格式 |
|------|------|----------|--------------|
| deepseek | DeepSeek 直连 | deepseek-chat, deepseek-reasoner | openai |
| dzzi | DZZI 中转 | Claude Sonnet/Opus（0.1计费） | native |
| dzzi-peruse | DZZI 按量 | Claude Opus 4.6 | native |
| openrouter | OpenRouter | anthropic/claude-opus-4.6 等 | openai_xml |
| antigravity | 本地反重力(:7861) | Claude, Gemini 2.5/3.0 | native |

`resolve_channel` 逻辑：模型名含 `anthropic/` → openrouter，含 `[0.1]` 或 DZZI 特征 → dzzi，否则 → deepseek。

### ThinkingAdapter（adapters.py）

三种格式统一转为标准 SSE 事件：
- `native`：content_block_start/delta/stop → thinking_start/delta/end + text_delta + done
- `openai`：reasoning_content → thinking 事件，content → text_delta
- `openai_xml`：`<thinking>...</thinking>` XML 流式解析，跨 chunk 缓冲

---

## 四、完整聊天链路

```
用户发送消息
│
├─ chatStore.sendMessage → POST /v1/chat/completions
│   Headers: Authorization: Bearer {token}, X-Session-Id: {sessionId}
│
├─ 后端 _reverie_chat()
│   ├─ JWT 验证
│   ├─ 拉取历史（当前 session 最近 5 轮，desc=True + reverse，收集窗口内 conv IDs）
│   ├─ build_context(session_id, user_input, model_channel, exclude_conversation_ids=窗口IDs)
│   │   └─ 系统提示词 + 核心记忆 + [全局近期] + [混合检索] + [维度摘要]（2500 token 预算）
│   │   └─ 返回 (context_messages, debug_info)
│   ├─ resolve_channel(model) → 通道配置
│   └─ _reverie_stream(context_debug_info=debug_info)（含流式工具调用循环，最多 3 轮）
│       ├─ 上游 API 携带 MEMORY_TOOLS（search/save/update/delete_memory）
│       ├─ 检测 delta.tool_calls → 收集函数名 + 参数
│       ├─ finish_reason == "tool_calls" → _execute_tool_call() → yield SSE 事件
│       ├─ 追加 tool result 到 messages → 重新发起流式请求
│       └─ finish_reason == "stop" → yield done，触发 background tasks
│
├─ 前端 SSE 事件循环
│   ├─ tool_searching  → isSearchingMemory = true
│   ├─ tool_result     → pendingMemoryResult
│   ├─ memory_saved / memory_updated / memory_deleted → pendingMemoryOps.push()
│   ├─ thinking_delta  → currentThinking +=
│   ├─ text_delta      → currentText +=
│   └─ done            → 合并所有状态到 messages[]（含 memoryRef + memoryOps + debugInfo）
│
└─ 后端 background tasks
    ├─ _reverie_store()：存 conversations 表（含 memory_ops JSONB，thinking_summary）
    ├─ store_conversation_embedding()：生成 embedding 写入 pgvector
    ├─ realtime_micro_summary()：判断是否自动创建记忆（每日 max 5条）
    └─ maybe_generate_dimensional_summary()：检查是否触发维度摘要（10轮或24h+3轮）
```

### SSE 事件完整协议

```json
{ "type": "tool_searching", "query": "..." }
{ "type": "tool_result", "found": 3, "content": "..." }
{ "type": "memory_saved", "content": "...", "mem_type": "topic", "layer": "core_living" }
{ "type": "memory_updated", "memory_id": "...", "new_content": "..." }
{ "type": "memory_deleted", "memory_id": "...", "reason": "..." }
{ "type": "thinking_start" }
{ "type": "thinking_delta", "content": "..." }
{ "type": "thinking_end" }
{ "type": "text_delta", "content": "..." }
{ "type": "done", "usage": {...}, "debug_info": {...} }
```

---

## 五、数据库表结构

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `sessions` | 会话管理 | `id, title, model, scene_type, message_count` |
| `conversations` | 对话存储 | `session_id, user_msg, assistant_msg, scene_type, model_channel, embedding(1024维), thinking_summary, memory_ops(jsonb)` |
| `memories` | 长期记忆 | `content, layer(core_base/core_living/scene), source(manual/auto/ai_tool), base_importance, hits, last_accessed_at, embedding(1024维)` |
| `memory_summaries` | 中期摘要 | `dimension(emotion/event/preference/knowledge), raw_summary, merged_summary, scene_type, period_start, period_end, source_message_ids` |
| `summaries` | Kelivo 旧摘要 | `summary, start_round, end_round, model_channel, embedding` |

**Supabase RPC**：
- `search_conversations_v2` — 向量搜索对话（filter_channel, filter_scene 参数）
- `search_summaries_v2` — 向量搜索摘要
- `search_memories_v2` — 向量搜索记忆（filter_layer, filter_scene, similarity_threshold 参数）

### context_builder 构建流程

Token 预算：2500 硬上限，优先级：

1. **核心记忆**（必注入）：core_base 按重要度排序 + core_living（**毕业机制**：14天内最新3条 + 超14天但 importance≥0.7 最多2条）+ scene（当前场景5条）
2. **全局近期对话**：跨 session 最新 3 轮（仅新 session 注入）
3. **混合检索**（`search_enabled=True`）：同义词扩展 → 关键词+向量并行搜 conversations+summaries → rerank（阈值0.3），排除滑动窗口内的 conv IDs（非整个 session）
4. **中期摘要**（`memory_summaries`）：每维度取最新一条 merged_summary，最多 4 个维度

---

## 六、FEATURE_FLAGS

定义在 `config.py`（已统一，`main.py` 通过 `from config import FEATURE_FLAGS` 引用）：

```python
FEATURE_FLAGS = {
    "memory_enabled": True,         # 是否存储对话到 Supabase
    "micro_summary_enabled": True,  # 是否触发实时微摘要（自动记忆，daily max 10条）
    "search_enabled": True,         # 混合检索（同义词+关键词+向量+rerank）
    "context_inject_enabled": True, # 是否注入上下文记忆
    "memory_tool_enabled": True,    # AI 主动记忆工具（search/save/update/delete）
    "list_tool_enabled": False,     # list_memories / batch_delete 工具（默认关）
}
```

Features 面板可在运行时修改（重启后恢复默认值）。

---

## 七、部署架构

```
Nginx (443, 宝塔管理)
├── /chat/         → Reverie 前端（静态文件，/www/wwwroot/kdreamling.work/chat/）
├── /api/          → Gateway 8001（需 JWT）
├── /v1/           → Gateway 8001（Kelivo 兼容，无 Basic Auth）
├── /mcp/          → MCP Server 8002
└── /diary/        → 日记 API 8003
```

部署指令见 `memory/deployment.md`（Claude Code 的自动记忆文件）。

---

## 八、技术细节提醒

- **消息格式**：`GET /sessions/{id}/messages` 返回的每条 record 是 `{ id, user_msg, assistant_msg, thinking_summary, memory_ops }`，前端在 `chatStore.loadMessages` 中拆成两条 ChatMessage（user + assistant）
- **API 包裹格式**：sessions 返回 `{ sessions: [...] }`，memories 返回 `{ memories: [...] }`
- **client.ts 用 PATCH 不是 PUT**
- **adapters.py 的 adapt 方法返回列表**（list of events），`main.py` 用 for 遍历
- **本地开发需关闭 TUN 模式代理**（否则 localhost 被拦截）
- **iOS safe-area 规则**：顶部 `calc(16px + env(safe-area-inset-top))`，底部 `env(safe-area-inset-bottom)`；`body` 背景必须 `#fafbfd`，否则 home indicator 漏色
- **iOS 高度**：用 `height: 100dvh` 而非 `100vh` 或 Tailwind `h-screen`
- **重命名 input**：value 为空 + placeholder 显示原标题 + autoFocus，避免 iOS 全选
- **消息删除**：前端传 `conversationId`（= `conversations` 表主键），后端一次删整行
- **Git Tags**：每个里程碑打 tag，最新：`v-before-embedding-graduation`

---

## 九、设计规范

| 用途 | 颜色 |
|------|------|
| 品牌主色 | `#002FA7`（克莱因蓝） |
| 登录页背景 | `#002FA7` → `#001a6e` 渐变 |
| 侧栏背景 | `#0a1a3a`（深蓝夜空）|
| 聊天区背景 | `#fafbfd`（微蓝白）|
| Thinking 区域 | `#f0f3fa` 底 + `#002FA7` 左线 |
| 记忆操作块 | `rgba(22,163,74,0.04)` 底 + 绿色左线 |
| Memory 标签：基石 | `#f59e0b`（琥珀）|
| Memory 标签：活水 | `#3b82f6`（蓝）|
| Memory 标签：场景 | `#8b5cf6`（紫）|

设计理念："登录是夜空，聊天是天亮。"

---

## 十、环境变量列表（仅变量名）

```
SUPABASE_URL / SUPABASE_KEY / SUPABASE_DB_URL
LLM_API_KEY / LLM_BASE_URL / LLM_MODEL          # DeepSeek
OPENROUTER_API_KEY
SILICONFLOW_API_KEY                               # embedding + rerank
DZZI_API_KEY / DZZI_PER_USE_API_KEY
AMAP_API_KEY / SERPER_API_KEY
PROXY_URL / YUQUE_TOKEN
GATEWAY_PORT / MEMU_PORT / MEMU_URL
AUTH_PASSWORD / JWT_SECRET / JWT_EXPIRE_DAYS
ENV                                               # dev / prod
```
