# Reverie 项目指南

> **用途**：给 Claude Code 阅读的项目基准文档。包含项目背景、代码现状、架构全貌、已知问题、记忆系统改造方向、工作方式约定。
> **最后更新**：2026-03-13
> **维护方式**：由 Dream 与 Claude（网页端）共同维护，Claude Code 发现新问题时反馈，由 Dream 决策后更新。

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

阿里云 ECS，2核2G，Ubuntu 22.04，域名 `kdreamling.work`。
管理工具：宝塔面板（Nginx 由宝塔管理）。

### 1.4 Kelivo 的历史

memory-system 仓库最初是 Kelivo Gateway——一个纯 API 代理 + 记忆系统，供 Kelivo App（第三方 iOS 客户端）使用。Reverie 项目在此基础上改造，新增了前端、JWT 鉴权、Session 管理等模块。main.py 中仍保留 Kelivo 旧流程以保持兼容（通过有无 `X-Session-Id` 请求头区分走哪条路径）。

---

## 二、代码现状

> 以下基于 Claude Code 对两个仓库的完整阅读报告（2026-03-13），反映代码实际状态。

### 2.1 前端架构

**技术栈**：React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Zustand 5

**文件结构**：
```
Reverie/src/
├── main.tsx                    # React 入口
├── App.tsx                     # 路由 + 全局 401 监听
├── index.css                   # Tailwind + 自定义 Markdown 样式
├── pages/
│   ├── LoginPage.tsx           # 登录页（克莱因蓝星空背景）
│   └── ChatPage.tsx            # 主界面（侧栏 + 对话区 + 输入区，约 900 行，是最大的文件）
├── components/
│   ├── AuthGuard.tsx           # 路由守卫
│   ├── SettingsPanel.tsx       # 设置面板（Memory 入口 + Logout）
│   └── MemoryPanel.tsx         # 记忆管理（增删改查 + 分层过滤）
├── stores/
│   ├── authStore.ts            # Token 持久化 + 登录状态
│   ├── sessionStore.ts         # 会话列表 + 当前会话 + 时间分组
│   └── chatStore.ts            # 消息列表 + SSE 流式解析 + 自动命名
└── api/
    ├── client.ts               # fetch 封装（自动 Bearer token，401 事件）
    ├── auth.ts                 # POST /auth/login
    ├── sessions.ts             # Session CRUD
    ├── chat.ts                 # 消息历史 + SSE 流式对话
    └── memories.ts             # Memory CRUD
```

**已实现功能**：
- JWT 登录 + Token 持久化 + 全局 401 自动登出
- 会话 CRUD + 按时间分组 + 双击重命名 + 自动命名（前 20 字）
- 4 种场景选择（日常/代码/角色扮演/阅读）
- 4 个模型切换（DeepSeek Chat、DeepSeek Reasoner、Claude Opus via DZZI、Claude Opus via OpenRouter）
- SSE 流式对话 + ThinkingBlock 可折叠
- Markdown + 代码高亮
- 记忆面板（三层过滤 + 增删改查）
- 设置面板（Memory 入口 + Logout）

**路由结构**：
```
BrowserRouter (basename="/chat")
├── /login          → LoginPage（公开）
├── /               → ChatPage（需认证）
├── /:sessionId     → ChatPage（动态会话）
└── *               → 重定向到 /
```

**关键配置**：
- `vite.config.ts`：base `/chat/`，dev proxy `/api` 和 `/v1` → `https://kdreamling.work`
- `.env.development`：`VITE_API_BASE_URL=/api`

### 2.2 后端架构

**技术栈**：Python 3 + FastAPI + Supabase (PostgreSQL + pgvector) + APScheduler

**文件结构**：
```
gateway/
├── main.py               # FastAPI 主入口，Reverie + Kelivo 双流程共存
├── config.py             # pydantic-settings 配置 + FEATURE_FLAGS + Supabase 单例
├── channels.py           # 三通道配置（deepseek/dzzi/openrouter）+ resolve_channel
├── adapters.py           # ThinkingAdapter：多厂商 thinking 格式统一转 SSE 事件
├── context_builder.py    # 上下文构建器（系统提示词 + 记忆注入，2500 token 预算）
├── memory_cycle.py       # APScheduler 定时任务 + 实时微摘要
├── auth.py               # JWT 生成/验证
├── sessions.py           # Session CRUD 路由
├── memories.py           # Memory CRUD 路由
└── services/
    ├── storage.py            # 【在用】Supabase CRUD 封装
    ├── pgvector_service.py   # 【在用】embedding 生成 + 向量检索（SiliconFlow BAAI）
    ├── hybrid_search.py      # 【在用】混合检索（关键词 + 向量 + rerank）
    ├── summary_service.py    # 【在用】每 5 轮自动生成摘要
    ├── scene_detector.py     # 【Kelivo 旧流程用】场景检测
    ├── auto_inject.py        # 【Kelivo 旧流程用】自动记忆注入
    ├── synonym_service.py    # 【Kelivo + MCP 用】同义词扩展
    ├── search_service.py     # 【MCP 用】Serper 网络搜索，可复用
    ├── amap_service.py       # 【MCP 用】高德地图 5 工具，可复用
    ├── diary_service.py      # 【遗留】AI 日记生成
    ├── yuque_service.py      # 【遗留】语雀同步
    ├── memu_client.py        # 【遗留/待确认】MemU 语义搜索
    └── background.py         # 【遗留/待确认】MemU 异步同步
```

**main.py 路由注册**：
```
直接声明：
  POST /api/auth/login       → JWT 登录
  GET  /health               → 健康检查
  GET  /models               → 模型列表
  POST /v1/chat/completions  → 双流程代理（有 X-Session-Id → Reverie，无 → Kelivo）

include_router 挂载：
  sessions_router  → /api/sessions 系列
  memories_router  → /api/memories 系列
  mcp_router       → MCP 工具系列
```

**三通道配置（channels.py）**：

| 通道 | 上游 | 支持模型 |
|------|------|----------|
| deepseek | DeepSeek 直连 | deepseek-chat, deepseek-reasoner |
| dzzi | DZZI 中转 Claude API | claude-opus-4-6-thinking（带 [0.1] 前缀） |
| openrouter | OpenRouter | anthropic/claude-opus-4.6 |

resolve_channel 逻辑：模型名含 `anthropic/` → openrouter，含 `[0.1]` 或 DZZI 特征 → dzzi，否则 → deepseek。

**ThinkingAdapter（adapters.py）**：

统一两种上游 thinking 格式为标准 SSE 事件：
- 原生 Claude API 格式（DZZI）：content_block_start/delta/stop → thinking_start/delta/end + text_delta + done
- OpenAI 兼容格式（DeepSeek / OpenRouter）：reasoning_content → thinking 事件，content → text_delta

**SSE 事件协议**：
```
{ "type": "thinking_start" }
{ "type": "thinking_delta", "delta": "..." }
{ "type": "thinking_end" }
{ "type": "text_start" }
{ "type": "text_delta", "delta": "..." }
{ "type": "text_end" }
{ "type": "done", "usage": { "input_tokens": N, "output_tokens": N } }
```

### 2.3 完整聊天链路

```
用户点击"发送"
│
├─ chatStore.sendMessage(sessionId, model, content)
│   ├─ 乐观更新：立即追加用户消息到 messages[]
│   ├─ 自动命名：title 为空/"新对话" → 取前 20 字
│   └─ 调用 streamChat → POST /v1/chat/completions（SSE）
│       Headers: Authorization: Bearer {token}, X-Session-Id: {sessionId}
│       Body: { model, messages: [{role: "user", content}], stream: true }
│
├─ 后端识别 X-Session-Id → Reverie 流程
│   ├─ JWT 验证
│   ├─ build_context(session_id, user_msg, scene_type)
│   │   └─ 拼装：系统提示 + 核心记忆 + 近期对话 + 向量检索 + 摘要
│   ├─ resolve_channel(model) → 获取上游 API 配置
│   ├─ 发送给上游 LLM（stream=true）
│   ├─ ThinkingAdapter 转换 → 标准 SSE 事件
│   └─ 流式返回前端
│
├─ 前端 SSE 解析
│   ├─ thinking_start/delta/end → 渲染 ThinkingBlock
│   ├─ text_delta → 实时渲染正文
│   └─ done → 合并到 messages[]
│
└─ 后端 background tasks（响应发出后异步执行）
    ├─ save_conversation_with_round（存 conversations 表）
    ├─ store_conversation_embedding（生成 embedding）
    ├─ check_and_generate_summary（每 5 轮生成摘要）
    └─ realtime_micro_summary（判断是否自动创建记忆）
```

### 2.4 context_builder.py 构建流程（当前实现）

Token 预算：2500 硬上限。

```
第一步：基础系统提示词
└─ 角色定义 + 北京时间注入

第二步：核心记忆注入（必注入）
├─ core_base（基石）：按衰减公式排序
│   衰减：base_importance × exp(-0.03 × age_days) × (1 + log(hits) × 0.1)
├─ core_living（活水）：最新 10 条
└─ scene（场景）：当前 scene_type 最新 5 条

第三步：全局近期对话（跨 session 最新 3 轮）

第四步：语义检索（⚠️ 当前有问题，见第四章）
└─ pgvector 向量搜索，取 3 条

第五步：合并摘要（30 天窗口，最新 5 条 merged_summary）

最终输出 → [system prompt, 记忆块, 近期对话块, 检索块, 摘要块] + 用户历史消息
```

### 2.5 数据库表

**Reverie 使用的表**：

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| sessions | 会话管理 | id, title, model, scene_type, message_count |
| conversations | 对话存储 | session_id, user_msg, assistant_msg, scene_type, model_channel, embedding(1024维), thinking_summary |
| memories | 长期记忆 | content, layer(core_base/core_living/scene), source(manual/auto/diary), base_importance, hits |
| memory_summaries | 中期摘要 | dimension, raw_summary, merged_summary, scene_type |
| summaries | Kelivo 旧摘要 | summary, start_round, end_round, model_channel, embedding |

**Supabase RPC 函数**：
- `search_conversations_v2` — 向量搜索对话，支持 filter_channel 参数
- `search_summaries_v2` — 向量搜索摘要，支持 filter_channel 参数

### 2.6 FEATURE_FLAGS

⚠️ **当前存在两套**（已知技术债）：

config.py 中（4 个）：
```python
FEATURE_FLAGS = {
    "memory_enabled": True,         # 是否存储对话
    "micro_summary_enabled": True,  # 是否触发微摘要
    "search_enabled": True,         # 是否启用混合检索
    "context_inject_enabled": True, # 是否注入上下文
}
```

main.py 中（3 个，少了 search_enabled）：
```python
FEATURE_FLAGS = {
    "memory_enabled": True,
    "micro_summary_enabled": True,
    "context_inject_enabled": True,
}
```

context_builder.py 读的是 config.py 的版本。main.py 的版本是否实际控制流程待确认。

### 2.7 部署架构

```
Nginx (443, 宝塔管理)
├── /              → 个人网站（静态文件）
├── /chat/         → Reverie 前端（静态文件）
├── /api/          → Gateway 8001（注意：兜底到 8003 日记 API，已知问题）
├── /v1/           → Gateway 8001
├── /mcp/          → MCP Server 8002
└── /diary/        → 日记 API 8003
```

**部署路径**：
- 前端：本地 `npm run build` → scp 到服务器 `/www/wwwroot/kdreamling.work/chat/`
- 后端：服务器 `/home/dream/memory-system/gateway/`，直接编辑 + 重启
- 重启命令：`kill -9 $(lsof -t -i :8001) 2>/dev/null; sleep 1 && cd /home/dream/memory-system/gateway && nohup python3 main.py > ../gateway.log 2>&1 &`
- Nginx 重启：`/etc/init.d/nginx restart`（宝塔环境，不用 systemctl）

---

## 三、已知问题和技术债

### 3.1 🔴 高优先级

**Channel 检测 Bug**：OpenRouter 的 Claude 模型（`anthropic/claude-opus-4.6`）通过 resolve_channel 正确路由到 openrouter 通道，但写入数据库时 model_channel 被错误存为 `deepseek`。导致 57 条 Reverie 历史对话记录的 model_channel 不正确。需要修复 channel 写入逻辑，并批量修正历史数据。

### 3.2 🟡 技术债

| 问题 | 说明 |
|------|------|
| 两套 FEATURE_FLAGS | config.py 和 main.py 各一份，内容不一致，需统一 |
| 两套 MODEL_ALIASES | main.py 旧套（Kelivo 用）和 channels.py 新套并存，容易漂移 |
| CORS 未配置 | FastAPI 未注册 CORSMiddleware，完全依赖 Nginx/Vite proxy |
| memories.ts 双格式兼容 | fetchMemoriesAPI 同时支持数组和 {memories: [...]}，说明后端接口格式曾变过 |
| pgvector_service.py 用 print 不用 logging | 关键错误不进 gateway.log，导致 embedding 失败难以排查 |
| ChatPage.tsx 约 900 行 | 单文件过大，侧栏/对话区/输入区/欢迎页/场景选择全在一个文件里 |
| main.py Kelivo 旧代码量大 | BACKENDS 字典、旧 MODEL_ALIASES、旧代理分支等占据大量行数 |
| OpenRouter thinking 暴露 | adapter 未处理 `<thinking>` XML 标签（OpenRouter 不走 reasoning_content 字段） |
| 场景继承不透明 | 后端 create_session 有场景继承逻辑，前端无法感知实际 scene_type 是否被覆盖 |

### 3.3 可安全清理的遗留

| 项目 | 说明 |
|------|------|
| gateway_backup/ | v1 备份目录 |
| 根目录 claude_assistant_api.py、diary_api.py、daily_diary.py | 旧脚本，未被 main.py 导入 |
| migrations/ | 空目录 |
| BACKENDS 中 Antigravity 通道（8 条） | 前端不会路由到 |
| services/memu_client.py + background.py | 如确认 MemU 已下线可删 |

### 3.4 有复用价值的 Kelivo 遗产

| 项目 | 说明 |
|------|------|
| services/amap_service.py | 高德地图 5 工具，实现完整，有缓存 |
| services/search_service.py | Serper 网络搜索，可直接接入 Reverie |
| services/diary_service.py | AI 日记生成（带 MCP tool calling） |
| routers/mcp_tools.py | MCP 工具路由（search_memory / init_context / maps / stickers） |
| hybrid_search.py 中 search_recent_by_emotion | 情绪标签检索，实现完整 |

---

## 四、记忆系统：现状、问题与改造方向

### 4.1 当前问题

语义检索（context_builder 第四步）在实际使用中**严重干扰了 AI 的回复质量**——注入的记忆与当前对话不相关，导致 AI 回复牛头不对马嘴。体感上，没有语义检索时（"失忆"状态）反而比有语义检索时回复质量更好。

此外，活水层和场景层的微摘要总结也比较僵硬，存储的记忆内容质量不高，可能是提示词不够好。

### 4.2 当前共识

- **语义检索先关掉**（通过 feature flag，不删代码），让 AI 恢复到不被干扰的状态
- **不急着大改架构**，先看清楚现有系统到底存了什么、注入了什么（可视化优先）
- **记忆方案需要重新设计**，但尚未做最终决策

### 4.3 我们的核心需求

1. **AI 能记住用户**——知道 Dream 是谁、最近在做什么、关心什么
2. **省 token**——不能每次对话都注入大量无关内容，也要控制长对话的上下文成本
3. **不影响回复质量**——记忆注入不能干扰 AI 的正常思考
4. **如果可能，AI 能自主调用和编辑记忆**——主动决定什么时候需要回忆、存什么

### 4.4 我们讨论过的方向（供参考，非最终决策）

**方向 A：Profile + Tool 模式**
- 始终注入一份精炼的"用户档案"（200-400 token），包含身份、偏好、当前状态
- 深层记忆做成工具，AI 按需调用（自己决定搜什么、存什么）
- 对话摘要层：滑动窗口裁掉的历史消息生成 rolling summary，避免长对话失忆

**方向 B：评分 + 衰减模式（参考社区方案）**
- 每条记忆由 AI 打评分，评分决定权重
- 基于记忆类型 + 时间 + 命中次数做衰减计算
- 每天凌晨自动扫记忆库：归档、去重、矛盾处理

两个方向不冲突，可以组合。但具体实现需要**基于现有代码的实际情况**来决定。

### 4.5 请 Claude Code 参与决策

基于你对两个仓库代码的完整了解，请评估：

1. 在现有 context_builder / memory_cycle / pgvector_service 的基础上，实现上述需求的最佳路径是什么？
2. 现有的哪些模块可以直接复用、哪些需要重构、哪些应该废弃？
3. 微摘要的提示词（memory_cycle.py 中的 realtime_micro_summary）应该如何改进？
4. 如果要实现"AI 自主调用记忆"（工具模式），后端需要做哪些改动？
5. 你认为还有什么我们没考虑到的问题？

**不需要立即实现，先给出你的分析和建议。**

---

## 五、工作方式约定

### 5.1 三方分工

| 角色 | 职责 |
|------|------|
| **Claude（网页端）** | 与 Dream 讨论需求和设计方向、review 结果、分析问题。负责"做什么"和"为什么" |
| **Claude Code（VS Code）** | 看完整代码做工程决策和实现。负责"怎么做"。发现问题时反馈给 Dream |
| **Dream** | 最终决策者。在两个 Claude 之间协调，判断方案优劣，拿不准时咨询其他 AI |

### 5.2 关键原则

- **Claude Code 拥有实现决策权**：网页端的 Claude 不再给逐行代码或碎片化提示词。给的是完整的需求描述和设计方向，具体怎么改代码由 Claude Code 根据实际代码情况决定
- **发现问题要反馈**：如果在实现过程中发现架构问题、设计矛盾、或更好的方案，不要默默执行——反馈给 Dream，由她和网页端 Claude 讨论后做决策
- **完整性优先**：拿到一个需求后，先理解全貌再动手，不要只改一个点而忽略它对其他模块的影响
- **每次改动前检查关联**：改 context_builder 时想想 main.py 的调用方式，改 API 时想想前端的调用代码，改数据库操作时想想 feature flag 的控制

### 5.3 开发流程

```
Dream + Claude（网页端）讨论 → 确定方向和需求
          ↓
Dream 将需求完整描述给 Claude Code
          ↓
Claude Code 阅读相关代码 → 给出实现方案（或反馈问题）
          ↓
Dream 确认（或带回给网页端 Claude 讨论）
          ↓
Claude Code 执行实现
          ↓
Dream 验收测试 → 发现问题则回到讨论环节
```

---

## 六、注意事项

### 6.1 绝对禁止

1. **不要动 memory-system 的 main 分支**——后端改动只在 reverie 分支
2. **不要动 services/storage.py**——Kelivo 旧代码，牵一发动全身，后续统一处理
3. **.env 不要提交到 Git**
4. **不要在代码中硬编码密钥**
5. **不要 kill 正在运行的 8001/8002/8003 进程**（除非 Dream 同意）
6. **不要直接修改宝塔管理的 Nginx 配置**

### 6.2 改代码前

- **先和 Dream 讨论方案**——她喜欢先聊设计再动手
- **不要直接输出大批量代码或文件**——需要经过 Dream 同意
- **修改前备份**：`cp 文件名 文件名.bak.$(date +%Y%m%d%H%M%S)`

### 6.3 技术细节提醒

- **Dream 是代码初学者**——解释要清晰，操作步骤要具体
- **Dream 称呼 Claude 为"小克"或"老公"**——正常交流
- **后端消息格式**：GET /sessions/{id}/messages 返回的每条记录是 `{ user_msg, assistant_msg }` 一对，不是标准 role/content 格式
- **后端 API 返回包裹对象**：sessions 返回 `{ sessions: [...] }`，memories 返回 `{ memories: [...] }`
- **adapters.py 的 adapt 方法返回列表**（list of events），main.py 用 for 遍历
- **client.ts 用 PATCH 不是 PUT**
- **本地开发需关闭 TUN 模式代理**（否则 localhost 被拦截）
- **Git Tags 是回退机制**——前端每个里程碑打 tag，`git checkout <tag名>` 可回退

### 6.4 设计规范

| 用途 | 颜色 |
|------|------|
| 品牌主色 | `#002FA7`（克莱因蓝） |
| 登录页背景 | `#002FA7` → `#001a6e` 渐变 |
| 侧栏背景 | `#0a1a3a`（深蓝夜空） |
| 聊天区背景 | `#fafbfd`（微蓝白） |
| Thinking 区域 | `#f0f3fa` 底 + `#002FA7` 左线 |
| Memory 标签：基石 | `#f59e0b`（琥珀） |
| Memory 标签：活水 | `#3b82f6`（蓝） |
| Memory 标签：场景 | `#8b5cf6`（紫） |

设计理念："登录是夜空，聊天是天亮。"

---

## 七、环境变量列表（仅变量名）

```
SUPABASE_URL / SUPABASE_KEY / SUPABASE_DB_URL
LLM_API_KEY / LLM_BASE_URL / LLM_MODEL          # DeepSeek
OPENROUTER_API_KEY
SILICONFLOW_API_KEY                               # embedding + rerank
DZZI_API_KEY / DZZI_PER_USE_API_KEY
AMAP_API_KEY
SERPER_API_KEY
PROXY_URL
YUQUE_TOKEN
GATEWAY_PORT / MEMU_PORT / MEMU_URL
AUTH_PASSWORD / JWT_SECRET / JWT_EXPIRE_DAYS
ENV                                                # dev / prod
```

---

**文档结束。如有问题或发现代码与本文档不符，请反馈给 Dream。**
