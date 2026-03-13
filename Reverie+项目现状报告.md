# Reverie 项目现状报告

1. 前端仓库（Reverie）
1.1 文件/目录结构

Reverie/
├── index.html                          # HTML 入口，挂载 #root
├── package.json                        # 依赖 & 脚本
├── vite.config.ts                      # Vite 构建配置
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── .env.development                    # 开发环境变量
├── 交给LTalk 架构设计文档·[最终定稿.md](http://xn--mbt18xmrpwie.md/)  # 架构设计文档（勿删）
├── [开发错误回顾与反思.md](http://xn--jhqx3lka832anyn8tbrx2mhlpsgh.md/)               # 开发笔记
├── [项目进度总结.md](http://xn--wxt28abz7bbhh18ve0l.md/)                     # 进度记录
└── src/
├── main.tsx                        # React 入口，StrictMode
├── App.tsx                         # 根组件，路由声明 + 全局事件监听
├── index.css                       # Tailwind 导入 + md-content 自定义样式
├── vite-env.d.ts                   # Vite 类型声明
├── pages/
│   ├── LoginPage.tsx               # 登录页（星空背景动画）
│   └── ChatPage.tsx                # 主聊天界面（侧边栏 + 对话区 + 输入区）
├── components/
│   ├── AuthGuard.tsx               # 路由守卫，未登录重定向 /login
│   ├── SettingsPanel.tsx           # 设置面板（记忆/功能/登出）
│   └── MemoryPanel.tsx             # 记忆管理界面（增删改查 + 分层过滤）
├── stores/
│   ├── authStore.ts                # Zustand：Token + 登录状态
│   ├── chatStore.ts                # Zustand：消息列表 + 流式状态
│   └── sessionStore.ts            # Zustand：会话列表 + 当前会话
└── api/
├── client.ts                   # HTTP 封装（自动注入 Token，处理 401）
├── auth.ts                     # POST /auth/login
├── chat.ts                     # GET messages + POST /v1/chat/completions (SSE)
├── sessions.ts                 # Session CRUD
└── memories.ts                 # Memory CRUD
1.2 已实现的功能（从代码实际状态判断）
Token 认证：密码登录 → JWT Token → localStorage 持久化 → 全局 401 自动登出
会话管理：创建、删除、重命名、按时间分组（今天/昨天/更早）、URL 路由同步（/:sessionId）
场景选择：4 种场景（日常/代码/角色扮演/阅读），新建会话时选择或从欢迎屏选择
模型切换：顶部下拉菜单，4 个选项（DeepSeek Chat、DeepSeek Reasoner、Claude Opus 4.6 via DZZI、Claude Opus via OpenRouter）
流式对话：SSE 接收，实时渲染 thinking block（可折叠）+ 正文
Markdown 渲染：react-markdown + rehype-highlight，含代码高亮
会话自动命名：第一条消息前 20 字作为标题（标题为"新对话"或空时触发）
记忆管理：三层（core_base/core_living/scene），增删改查，按层过滤，手动/自动/日记来源标注
设置面板：从记忆入口进入 MemoryPanel，登出按钮
1.3 第三方依赖
依赖	版本	用途
react / react-dom	^19.0.0	UI 框架
react-router-dom	^7.1.5	路由（含 basename=/chat）
zustand	^5.0.3	轻量状态管理
react-markdown	^9.0.1	渲染 AI 回复中的 Markdown
rehype-highlight	^7.0.2	代码块语法高亮
lucide-react	^0.474.0	图标库
tailwindcss	^4.0.6	CSS 框架（via @tailwindcss/vite 插件）
vite	^6.1.0	构建工具
1.4 关键配置
vite.config.ts：

base: '/chat/'（所有静态资源路径前缀）
插件：@vitejs/plugin-react + @tailwindcss/vite
dev server proxy：/api 和 /v1 → [https://kdreamling.work](https://kdreamling.work/)（开发时代理到远端网关）
.env.development：

VITE_API_BASE_URL=/api（前端 API 请求前缀）
1.5 路由结构

BrowserRouter (basename="/chat")
├── /login              → <LoginPage>（公开）
├── /                   → <ChatPage>（需认证，AuthGuard 包裹）
├── /:sessionId         → <ChatPage>（需认证，动态会话 ID）
└── *                   → Navigate to /
2. 后端仓库（memory-system，reverie 分支）
2.1 gateway/ 目录结构

gateway/
├── [main.py](http://main.py/)             # FastAPI 应用主体，代理逻辑，Reverie/Kelivo 双流程
├── [config.py](http://config.py/)           # Settings（pydantic-settings）+ FEATURE_FLAGS + Supabase 单例
├── [channels.py](http://channels.py/)         # 三通道配置（deepseek/dzzi/openrouter）+ resolve_channel
├── [adapters.py](http://adapters.py/)         # ThinkingAdapter：多厂商 thinking 格式统一转换
├── context_builder.py  # 上下文构建器（记忆注入，2500 token 预算）
├── memory_cycle.py     # 定时任务调度器 + 微摘要（APScheduler）
├── [auth.py](http://auth.py/)             # JWT Token 生成/验证
├── [sessions.py](http://sessions.py/)         # Session CRUD（FastAPI Router，/api/sessions）
├── [memories.py](http://memories.py/)         # Memory CRUD（FastAPI Router，/api/memories）
├── services/
│   ├── [storage.py](http://storage.py/)          # Supabase 操作封装（conversations + summaries 表）
│   ├── pgvector_service.py # 向量 embedding 生成/存储/检索（SiliconFlow BAAI）
│   ├── hybrid_search.py    # 混合检索（关键词 + 向量 + rerank）
│   ├── summary_service.py  # 对话自动摘要生成（每 5 轮触发）
│   ├── auto_inject.py      # 规则驱动记忆注入（冷启动/回忆/剧情/情绪）
│   ├── scene_detector.py   # 规则场景识别（daily/plot/meta）
│   ├── synonym_service.py  # 查询词扩展（synonym_map 表）
│   ├── memu_client.py      # MemU 语义搜索接口（待确认是否仍在部署）
│   ├── amap_service.py     # 高德地图 5 工具（地理编码/周边/搜索/距离/路线）
│   ├── [background.py](http://background.py/)       # 异步同步到 MemU（轮询，30s 间隔）
│   ├── diary_service.py    # AI 日记生成（MCP tool calling）
│   ├── yuque_service.py    # 语雀文档同步
│   ├── search_service.py   # Serper 网络搜索
│   └── **init**.py
├── routers/
│   ├── mcp_tools.py    # MCP 工具路由（search_memory/init_context/save_diary/maps/stickers）
│   └── **init**.py
├── .env.template       # 环境变量模板
├── requirements.txt    # Python 依赖
└── [deploy.sh](http://deploy.sh/)           # 部署脚本
2.2 Reverie 正在使用 vs. Kelivo 遗留的区分
Reverie 核心路径（全部在用）：

[main.py](http://main.py/) 中的 _reverie_chat() 分支（触发条件：请求头包含 X-Session-Id）
[auth.py](http://auth.py/)、[sessions.py](http://sessions.py/)、[memories.py](http://memories.py/)[channels.py](http://channels.py/)、[adapters.py](http://adapters.py/)、context_builder.py、memory_cycle.py
services/storage.py（所有函数，含 Reverie 新增字段）
services/pgvector_service.py（embedding 生成 + 向量检索）
services/hybrid_search.py（Reverie context_builder 调用）
services/summary_service.py（5 轮触发，Reverie 仍在用）
Kelivo 遗留但仍运行（共存代码）：

[main.py](http://main.py/) 中的 proxy_chat_completions 旧分支（无 X-Session-Id 时走此路径）
services/auto_inject.py（Kelivo 自动注入，旧流程用，Reverie 流程不调用）
services/scene_detector.py（Kelivo 旧流程用）
services/synonym_service.py（Kelivo 旧流程用，MCP 工具也用）
BACKENDS 字典中大量旧通道（Antigravity、各 Gemini 条目等，Reverie 前端不会选到）
[main.py](http://main.py/) 中的 MODEL_ALIASES（与 [channels.py](http://channels.py/) 中有重复，两套并存）
纯 Kelivo 遗留（Reverie 不调用）：

services/memu_client.py + services/background.py（MemU 同步，待确认 MemU 是否仍运行）
services/diary_service.py + services/yuque_service.py（日记生成和语雀同步）
services/search_service.py（Serper 搜索，仅 MCP 工具调用）
routers/mcp_tools.py（MCP 工具接口，非 Reverie 前端调用路径）
根目录 claude_assistant_api.py、diary_api.py、daily_diary.py（旧版 API，未被 [main.py](http://main.py/) 导入）
2.3 [main.py](http://main.py/) 注册的路由和中间件
直接在 [main.py](http://main.py/) 声明的端点：

POST /api/auth/login       → create_token（无需鉴权）
GET  /health               → 健康检查（无需鉴权）
GET  /models               → 模型列表（无需鉴权）
POST /v1/chat/completions  → 双流程代理（有 X-Session-Id → Reverie，无 → Kelivo）
通过 include_router 挂载：

sessions_router  → /api/sessions 系列（[sessions.py](http://sessions.py/)）
memories_router  → /api/memories 系列（[memories.py](http://memories.py/)）
mcp_router       → MCP 工具系列（mcp_tools.py）
中间件： 代码中未注册任何显式中间件（无 CORS、无日志中间件），鉴权通过 FastAPI Dependency（auth_required）实现。

2.4 FEATURE_FLAGS 完整内容
[config.py](http://config.py/) 和 [main.py](http://main.py/) 中各有一份，存在重复（不一致）：

[config.py](http://config.py/) 中（4 个）：

FEATURE_FLAGS = {
"memory_enabled": True,         # 控制是否存储对话到 Supabase
"micro_summary_enabled": True,  # 控制是否触发微摘要
"search_enabled": True,         # 控制是否启用混合检索
"context_inject_enabled": True, # 控制是否注入上下文
}
[main.py](http://main.py/) 中（3 个，比 [config.py](http://config.py/) 少 search_enabled）：

FEATURE_FLAGS = {
"memory_enabled": True,
"micro_summary_enabled": True,
"context_inject_enabled": True,
}
context_builder.py 导入的是 [config.py](http://config.py/) 的 FEATURE_FLAGS，[main.py](http://main.py/) 的 FEATURE_FLAGS 目前仅声明了但未查到明确引用位置（待确认是否实际控制流程）。

2.5 context_builder.py 完整构建流程
Token 预算：2500 tokens（硬上限）

第一步：基础系统提示词
└─ 固定角色规则 + 北京时间注入

第二步：核心记忆注入（优先级最高，必注入）
├─ core_base（基石）：重要度打分排序，按衰减公式筛选
│   衰减：base_importance × exp(-0.03 × age_days) × (1 + log(hits) × 0.1)
├─ core_living（活水）：取最新 10 条
└─ scene（场景）：取当前 scene_type 最新 5 条

第三步：全局近期对话（3 轮，跨 session）

第四步：语义检索（消耗 token 允许时注入）
└─ pgvector 向量搜索，3 条结果

第五步：合并摘要（30 天窗口，最新 5 条 merged_summary）

最终输出：
[system prompt]
[核心记忆块]
[近期对话块]
[语义搜索结果块]
[摘要块]

- 原始 messages（用户历史消息）
2.6 [channels.py](http://channels.py/) 通道配置和 resolve_channel 逻辑
三个通道：

deepseek：直连 DeepSeek API，支持 deepseek-chat + deepseek-reasoner
dzzi：    DZZI 中转 Claude API，支持 thinking，使用 [0.1] 计费密钥
openrouter：OpenRouter，支持 Claude Opus 4.6（anthropic/claude-opus-4.6）
resolve_channel 逻辑：

根据传入的 model 字符串前缀/关键字匹配对应通道
返回 (channel_name, config_dict, resolved_model_name)
如果模型名包含 anthropic/，路由到 openrouter
如果模型名包含 [0.1] 或 DZZI 特征，路由到 dzzi
否则默认 deepseek
2.7 [adapters.py](http://adapters.py/) 的 thinking 处理逻辑
ThinkingAdapter 将两种上游格式统一转换为标准 SSE 事件序列：

原生 Claude API 格式（DZZI 中转）：

content_block_start (type=thinking) → 发出 thinking_start
content_block_delta (thinking_delta) → 发出 thinking_delta
content_block_stop → 发出 thinking_end
content_block_start (type=text) → 发出 text_start
content_block_delta (text_delta) → 发出 text_delta
message_stop → 发出 done
OpenAI 兼容格式（deepseek-reasoner / OpenRouter Claude）：

delta 中出现 reasoning_content → 识别为 thinking，依次发出 thinking_start/thinking_delta/thinking_end
delta 中出现 content → 发出 text_delta
finish_reason=stop + 有 usage → 发出 done（含 usage 字段）
2.8 memory_cycle.py 定时任务

启动时：setup_scheduler() 注册 APScheduler AsyncIOScheduler

实时任务（每次对话结束后异步触发）：
realtime_micro_summary(session_id, user_msg, assistant_msg, scene_type)
├─ 发送给 DeepSeek-chat：判断是否有新值得记忆的信息
├─ 返回 JSON：{has_new_info: bool, category: str, content: str, layer: str}
├─ 若 has_new_info=true → 创建 memory 记录（core_living 或 scene 层）
└─ 出错时静默（不影响主流程）

每周定时（周日凌晨 1:00）：
rebuild_merged_summary()
└─ 从 raw_summary 重建 merged_summary（7 天滚动窗口）

每日定时（凌晨 3:00）：
daily_backup()
└─ 导出 conversations + memories 到 /www/backups/{date}.json

每月定时（每月 1 日凌晨 4:00）：
monthly_archive_check()
└─ 当前仅打印日志，无实际删除操作
2.9 services/ 各文件状态
文件	状态	说明
[storage.py](http://storage.py/)	在用	Reverie 核心存储层
pgvector_service.py	在用	embedding + 向量检索
hybrid_search.py	在用	context_builder 调用
summary_service.py	在用	5 轮触发摘要
scene_detector.py	部分在用	Kelivo 旧流程用，Reverie 流程不用
auto_inject.py	部分在用	Kelivo 旧流程用，Reverie 流程不用
synonym_service.py	部分在用	Kelivo 旧流程 + MCP 工具用
memu_client.py	待确认	依赖 MemU 服务是否仍运行
[background.py](http://background.py/)	待确认	依赖 MemU 服务
amap_service.py	部分在用	仅通过 MCP 工具调用，Reverie 前端不直接用
diary_service.py	遗留	仅 MCP 工具调用
yuque_service.py	遗留	仅 diary_service 调用
search_service.py	遗留	仅 MCP 工具调用
2.10 数据库表结构
conversations

id, session_id, user_id, user_msg, assistant_msg, scene_type, model_channel,
round_number, weight, synced_to_memu, thinking_summary, topic, entities, emotion,
embedding (pgvector 1024维), created_at, updated_at
sessions

id, user_id, title, model, scene_type, message_count, created_at, updated_at
memories

id, content, layer (core_base|core_living|scene), scene_type, source (manual|auto|diary),
base_importance, hits, last_accessed_at, created_at, updated_at
summaries

id, user_id, summary, start_round, end_round, scene_type, model_channel,
embedding (pgvector), created_at
memory_summaries

dimension, merged_summary, raw_summary, updated_at, scene_type
synonym_map

term, synonyms (array)
ai_diaries

diary_date, content, mood
2.11 环境变量列表

SUPABASE_URL
SUPABASE_KEY
SUPABASE_DB_URL
LLM_API_KEY          # DeepSeek
LLM_BASE_URL
LLM_MODEL
OPENROUTER_API_KEY
SILICONFLOW_API_KEY  # embedding + rerank
DZZI_API_KEY
DZZI_PER_USE_API_KEY
AMAP_API_KEY
SERPER_API_KEY
PROXY_URL
YUQUE_TOKEN
GATEWAY_PORT
MEMU_PORT
MEMU_URL
AUTH_PASSWORD
JWT_SECRET
JWT_EXPIRE_DAYS
ENV                  # dev / prod
3. 前后端交互
3.1 所有 API 端点
方法	路径	用途	需要鉴权
POST	/api/auth/login	密码登录，返回 JWT	否
GET	/health	服务健康检查	否
GET	/models	返回所有支持的模型	否
POST	/v1/chat/completions	流式对话（SSE）	是（Bearer Token）
GET	/api/sessions	获取会话列表	是
POST	/api/sessions	创建新会话	是
GET	/api/sessions/{id}	获取单个会话详情	是
PATCH	/api/sessions/{id}	更新会话（标题/模型/场景）	是
DELETE	/api/sessions/{id}	删除会话（级联删除对话）	是
GET	/api/sessions/{id}/messages	获取会话消息历史	是
POST	/api/sessions/{id}/export	导出会话为 JSON	是
GET	/api/memories	获取记忆列表（支持 layer 过滤）	是
POST	/api/memories	创建记忆	是
PATCH	/api/memories/{id}	更新记忆内容	是
DELETE	/api/memories/{id}	删除记忆	是
POST	/api/mcp/...	MCP 工具（search_memory 等）	待确认
3.2 完整聊天链路

用户点击"发送"
│
├─ chatStore.sendMessage(sessionId, model, content)
│   ├─ 立即将用户消息追加到 messages[]（乐观更新）
│   ├─ 若 session.title 为空/"新对话" → 自动重命名（取前 20 字）
│   └─ 调用 streamChat(sessionId, model, content, token)
│
├─ POST /v1/chat/completions
│   Headers: Authorization: Bearer {token}, X-Session-Id: {sessionId}
│   Body: { model, messages: [{role: "user", content}], stream: true }
│
├─ 后端识别 X-Session-Id → 走 Reverie 流程
│   ├─ JWT 验证（auth_required）
│   ├─ build_context(session_id, user_msg, scene_type)
│   │   └─ 拼装：系统提示 + 核心记忆 + 近期对话 + 向量检索 + 摘要
│   ├─ resolve_channel(model) → 获取上游 API 配置
│   ├─ 拼装完整 messages 发送给上游 LLM（stream=true）
│   ├─ ThinkingAdapter 处理上游 SSE → 转换为标准事件
│   └─ 流式返回给前端
│
├─ 前端 SSE 事件循环
│   ├─ thinking_start → currentThinking 置空
│   ├─ thinking_delta → currentThinking += delta
│   ├─ thinking_end   → thinking block 完成
│   ├─ text_delta     → currentText += delta，实时渲染
│   └─ done           → 将 currentText/currentThinking 合并入 messages[]
│
└─ 后端 background task（响应发出后）
├─ save_conversation_with_round（存入 conversations 表）
├─ store_conversation_embedding（生成 embedding 存入 pgvector）
├─ check_and_generate_summary（每 5 轮生成摘要）
└─ realtime_micro_summary（判断是否自动创建记忆）
3.3 SSE 事件类型和格式
前端解析的事件均为 data: {JSON}\n\n 格式：

{ "type": "thinking_start" }
{ "type": "thinking_delta", "delta": "..." }
{ "type": "thinking_end" }
{ "type": "text_start" }
{ "type": "text_delta", "delta": "..." }
{ "type": "text_end" }
{ "type": "done", "usage": { "input_tokens": N, "output_tokens": N } }
注意：前端代码处理了 thinking_start/thinking_delta/thinking_end 和 text_delta，未处理 text_start、text_end、done.usage（忽略这几种事件不影响功能）。

1. 问题和异常
4.1 代码问题
两套 MODEL_ALIASES 并存：[main.py](http://main.py/) 第 204 行和 [channels.py](http://channels.py/) 各有一套，内容不一致。[main.py](http://main.py/) 的旧套用于 Kelivo 流程（get_backend_config），[channels.py](http://channels.py/) 的新套用于 Reverie 流程。维护两套容易出现漂移。

两套 FEATURE_FLAGS：[config.py](http://config.py/) 和 [main.py](http://main.py/) 各一份，[main.py](http://main.py/) 少了 search_enabled。context_builder.py 读的是 [config.py](http://config.py/) 版本，[main.py](http://main.py/) 版本是否被实际使用待确认。

CORS 未配置：FastAPI app 未注册 CORSMiddleware。开发时依赖 Vite proxy 绕过，生产环境由 Nginx 处理跨域（假设 nginx 配置正确）。如果直接访问 8001 端口会有 CORS 问题。

前端 memories.ts 中的 response 兼容处理：fetchMemoriesAPI 同时支持数组和 {memories: [...]} 两种返回格式，说明后端接口格式曾经变过，存在历史痕迹。

sessionStore.updateSessionModel 更新后重新请求整个列表（而非本地更新），在网络不稳定时有延迟闪烁风险。

chatStore.sendMessage 中的安全网定时器：注释提到"如果 done 事件始终没来就停止流式"，说明后端有时可能不发 done 事件（已知缺陷）。

4.2 前后端不一致
前端调用 GET /sessions/{id}/messages，返回结构是会话对话记录（每条含 user_msg + assistant_msg），前端在 chatStore.loadMessages 中将每条记录拆成两条 ChatMessage，这与接口命名（messages）语义一致，但字段名需要精确对齐（user_msg、assistant_msg、thinking_summary）。如果后端字段重命名会静默失败。

前端 MODELS 列表中的模型值（[0.1]claude-opus-4-6-thinking、anthropic/claude-opus-4.6）需要和后端 [channels.py](http://channels.py/) 的 resolve_channel 逻辑精确匹配，否则会 fallback 到 deepseek。当前看起来是匹配的，但文档化不足。

GET /api/sessions 返回 { sessions: [...] } 包装格式，前端已处理（data.sessions）。

GET /api/memories 返回格式前端做了双兼容（见问题 4.1 第 4 条），说明存在历史不一致。

后端 POST /api/sessions 支持 scene_type 和 model 参数，前端在 createSession 时都传了，但后端还有"场景继承"逻辑（从上一个 session 继承 scene_type），前端无法感知到实际 scene_type 是否被覆盖，可能导致前端显示的场景和后端实际用的不一致。

1. Kelivo 遗产清单
5.1 Kelivo 遗留文件/功能
文件/功能	状态描述
[main.py](http://main.py/) 中 Kelivo 旧代理分支（无 X-Session-Id 路径）	仍在运行，但 Reverie 前端不走此路径
BACKENDS 字典中 Antigravity 通道（7+ 条目）	配置存在，前端无法选到
[main.py](http://main.py/) 中的 MODEL_ALIASES（旧套）	仅服务 Kelivo 旧流程
services/scene_detector.py	Kelivo 旧流程用，Reverie 不调用
services/auto_inject.py	Kelivo 旧流程用，Reverie 不调用
services/memu_client.py	MemU 集成，是否仍运行待确认
services/background.py	MemU 同步，依赖 memu_client
services/diary_service.py	日记生成，仅 MCP 路由调用
services/yuque_service.py	语雀同步，仅 diary_service 调用
services/search_service.py	Serper 搜索，仅 MCP 路由调用
routers/mcp_tools.py	MCP 工具路由，Reverie 前端不调用
根目录 claude_assistant_api.py	旧 Claude API 集成脚本，未被 [main.py](http://main.py/) 导入
根目录 diary_api.py	旧日记 API，未被 [main.py](http://main.py/) 导入
根目录 daily_diary.py	日记定时调度，未被 [main.py](http://main.py/) 导入
gateway_backup/	v1 备份目录，可确认废弃
website/	静态资源目录，用途不明
migrations/	空目录，无迁移文件
5.2 有复用价值的 Kelivo 遗产
services/amap_service.py：高德地图 5 工具（地理编码、周边搜索、路线规划），实现完整、有缓存机制，如果 Reverie 未来需要位置功能可以直接复用。
services/search_service.py：Serper 网络搜索，若 Reverie 需要联网能力可以直接接入。
services/diary_service.py：AI 日记生成（带 MCP tool calling），如果 Reverie 未来要加日记功能可以复用核心逻辑。
services/hybrid_search.py 中的 search_recent_by_emotion：情绪标签检索，目前 Reverie 的 context_builder 未使用，但是实现完整可用。
routers/mcp_tools.py 中的 search_memory / init_context：如果 Reverie 未来需要 Claude Desktop 集成，这套 MCP 接口直接可用。
5.3 可以安全删除的内容
gateway_backup/ 整个目录（v1 备份）
claude_assistant_api.py、diary_api.py、daily_diary.py（根目录旧脚本，未被任何路径导入）
migrations/（空目录）
BACKENDS 中所有 Antigravity 通道（共 8 条，前端永远不会路由到）
services/background.py（如果确认 MemU 已下线）
services/memu_client.py（同上）