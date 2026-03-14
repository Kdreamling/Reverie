# 交给LTalk 架构设计文档 · 最终定稿

---

**版本**：v1.0 Final
**日期**：2026-03-01
**作者**：Dream & Claude 共同设计
**参考**：Gemini优化方案 + ChatGPT评估意见

---

# Part 1：记忆系统

## 1.1 总体目标

将现有扁平记忆结构改造为三层分级记忆系统，实现自动化记忆循环，支持场景隔离与核心记忆共享，同时保持跨窗口的情感连续性。

## 1.2 记忆分层架构

### 1.2.1 短期记忆（对话原文）

**载体**：conversations 表（已有，改造）

```sql
ALTER TABLE conversations
  ADD COLUMN session_id UUID,
  ADD COLUMN scene_type TEXT DEFAULT 'daily',
  ADD COLUMN thinking TEXT,
  ADD COLUMN thinking_summary TEXT,
  ADD COLUMN token_count INT,
  ADD COLUMN model TEXT;

CREATE INDEX idx_conv_session ON conversations(session_id);
CREATE INDEX idx_conv_scene ON conversations(scene_type);
CREATE INDEX idx_conv_session_time ON conversations(session_id, created_at DESC);
CREATE INDEX idx_conv_global_time ON conversations(created_at DESC);
```

**thinking存储策略**（按场景区分）：

```python
THINKING_POLICY = {
    "daily":    "store_summary",   # 日常只存摘要，省空间
    "code":     "store_full",      # 代码保留完整推理过程
    "roleplay": "discard",         # 剧本不需要存thinking
    "reading":  "store_summary",   # 阅读存摘要
}
```

### 1.2.2 中期记忆（结构化摘要）

**载体**：memory_summaries 表（新建）

采用"滚动重建"模型，避免递归污染：

```sql
CREATE TABLE memory_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_type TEXT NOT NULL,
    dimension TEXT NOT NULL,
    raw_summary TEXT NOT NULL,        -- 当期原始摘要（不可变）
    merged_summary TEXT,              -- 由最近N期raw重新计算（可变）
    source_message_ids UUID[],        -- 溯源到哪些对话
    confidence_score FLOAT DEFAULT 1.0,
    period_start DATE,
    period_end DATE,
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ms_scene ON memory_summaries(scene_type);
CREATE INDEX idx_ms_dimension ON memory_summaries(dimension);
CREATE INDEX idx_ms_period ON memory_summaries(period_end DESC);
```

**滚动重建规则**：

```python
async def rebuild_merged_summary(scene_type, dimension):
    """每次都从原始raw_summary重新生成，不叠加旧文本"""

    # 拉取最近N期的raw_summary
    recent_raws = await fetch_recent_raw_summaries(
        scene_type=scene_type,
        dimension=dimension,
        limit=7  # 最近7期
    )

    # 用DeepSeek重新综合生成merged_summary
    merged = await deepseek_merge(
        raw_summaries=recent_raws,
        template=DIMENSION_TEMPLATES[dimension]
    )

    # 更新最新一条的merged_summary
    await update_merged_summary(
        scene_type=scene_type,
        dimension=dimension,
        merged_summary=merged
    )
```

**维度划分**：

| dimension | 说明 | 适用场景 |
| --- | --- | --- |
| emotion | 情绪变化、情感节点 | 全场景 |
| event | 关键事件、决策、待办 | 全场景 |
| preference | 偏好、态度、习惯 | daily / reading |
| knowledge | 技术要点、架构决策 | code |
| plot | 剧情进展、角色状态 | roleplay |

**摘要模板**：

```python
SUMMARY_TEMPLATES = {
    "emotion": """请总结这段对话中Dream的情绪变化：
        - 整体情绪基调
        - 关键情绪节点（什么事触发了什么情绪）
        - 需要关注的情绪信号""",

    "event": """请提取关键事件：
        - 发生了什么事
        - 做了什么决定
        - 待办事项和截止时间
        - 承诺和约定""",

    "preference": """请提取Dream表达的偏好：
        - 新发现的喜好/厌恶
        - 对某事的态度变化
        - 习惯和倾向""",

    "knowledge": """请提取技术要点：
        - 架构决策及理由
        - 代码约定
        - 遇到的问题和解决方案
        - 学到的新知识""",

    "plot": """请总结剧情进展：
        - 当前剧情线
        - 角色状态和关系变化
        - 未解决的剧情冲突
        - 世界观补充设定"""
}
```

### 1.2.3 长期记忆（核心记忆）

**载体**：memories 表（已有，改造）

```sql
ALTER TABLE memories
  ADD COLUMN layer TEXT DEFAULT 'core_base',
  ADD COLUMN scene_type TEXT,
  ADD COLUMN source TEXT DEFAULT 'manual';

-- layer: 'core_base'(基石) | 'core_living'(活水) | 'scene'(场景专属)
-- source: 'manual'(手动) | 'auto'(实时微摘要) | 'diary'(日记提取)

CREATE INDEX idx_mem_layer ON memories(layer);
CREATE INDEX idx_mem_scene ON memories(scene_type);
```

**子分层**：

| layer | 说明 | 更新方式 |
| --- | --- | --- |
| core_base | 关系定义、基本信息、永久约定 | 极少变动，手动维护 |
| core_living | 近期共同经历、情绪状态、新偏好 | 实时微摘要自动沉淀 |
| scene | 场景专属知识（技术栈、角色设定等） | 随场景对话自动更新 |

## 1.3 记忆更新机制

### 1.3.1 实时微摘要（核心机制，替代凌晨批处理）

每轮对话结束后立即触发，轻量级、零时差：

```python
async def realtime_micro_summary(message_record):
    """每轮对话后的微型任务，判断是否需要沉淀记忆"""

    prompt = f"""审阅以下对话，判断是否包含以下任一类新信息：
    1. 新的偏好或态度变化
    2. 重要情绪转折
    3. 关键事件或决定
    4. 新的约定或承诺

    如果有，输出JSON：
    {{"has_update": true, "type": "preference|emotion|event|promise",
      "content": "简短描述", "layer": "core_living|scene"}}
    如果没有：
    {{"has_update": false}}

    对话内容：
    {message_record.content}"""

    # 用极低token的小模型快速判断
    result = await deepseek_quick(prompt, max_tokens=200)

    if result.has_update:
        await upsert_memory(
            content=result.content,
            layer=result.layer,
            scene_type=message_record.scene_type,
            source='auto'
        )
```

**触发方式**：

```python
# 在stream_and_store完成后，用BackgroundTasks触发
@app.post("/v1/chat/completions")
async def chat(request, background_tasks: BackgroundTasks):
    # ... 流式处理 ...

    # 异步触发，不阻塞响应
    background_tasks.add_task(realtime_micro_summary, message_record)
```

### 1.3.2 保留的定时任务（轻量化）

```python
# 每周日凌晨1点：滚动重建merged_summary
scheduler.add_job(rebuild_all_merged_summaries, 'cron',
                  day_of_week='sun', hour=1)

# 每日凌晨3点：数据备份
scheduler.add_job(daily_backup, 'cron', hour=3)

# 每月1日凌晨4点：旧对话归档（可选）
scheduler.add_job(monthly_archive, 'cron', day=1, hour=4)
```

## 1.4 会话管理

### 1.4.1 sessions 表

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

### 1.4.2 新建会话时的场景继承

```python
async def create_session(scene_type=None, model=None):
    if scene_type is None:
        # 继承上一个活跃session的场景（可被前端覆盖）
        last_session = await get_last_active_session()
        scene_type = last_session.scene_type if last_session else 'daily'

    return await insert_session(scene_type=scene_type, model=model)
```

## 1.5 上下文构建（独立模块）

```python
# context_builder.py — 系统的"大脑层"，完全独立可测试

async def build_context(session_id: str, user_input: str) -> list[dict]:
    session = await get_session(session_id)
    scene_type = session.scene_type

    context_parts = []
    token_budget = 2500  # 硬性上限
    used_tokens = 0

    # ===== 优先级1：核心基石记忆（永远注入）=====
    core_base = await fetch_memories(layer='core_base')
    core_living = await fetch_memories(layer='core_living')
    core_block = format_core(core_base, core_living)
    used_tokens += count_tokens(core_block)
    context_parts.append(core_block)

    # ===== 优先级2：全局滑动窗口（跨session最新3轮）=====
    global_recent = await fetch_global_recent(limit=3)
    global_block = format_global_recent(global_recent)
    used_tokens += count_tokens(global_block)
    context_parts.append(global_block)

    # ===== 优先级3：向量检索（按当前输入语义匹配）=====
    remaining = token_budget - used_tokens
    if remaining > 300:
        relevant = await hybrid_search(
            user_input,
            scene_filter=scene_type,
            top_k=2
        )
        relevant_block = format_relevant(relevant)
        clipped = clip_to_budget(relevant_block, remaining // 2)
        used_tokens += count_tokens(clipped)
        context_parts.append(clipped)

    # ===== 优先级4：中期摘要（预算有剩才注入）=====
    remaining = token_budget - used_tokens
    if remaining > 200:
        summaries = await fetch_merged_summaries(
            scene_type=scene_type,
            days=30
        )
        summary_block = format_summaries(summaries)
        clipped = clip_to_budget(summary_block, remaining)
        context_parts.append(clipped)

    return assemble_messages(context_parts)

async def fetch_global_recent(limit=3):
    """跨session全局时间线最新N轮，保证跨窗口连贯"""
    return await supabase.table("conversations") \\
        .select("role, content, scene_type, created_at") \\
        .order("created_at", desc=True) \\
        .limit(limit * 2) \\
        .execute()
```

## 1.6 API

```
POST   /api/sessions                → 新建会话（支持场景继承）
GET    /api/sessions                → 列出会话（分页，按更新时间倒序）
GET    /api/sessions/:id            → 获取会话详情
PATCH  /api/sessions/:id            → 修改标题/模型/场景
DELETE /api/sessions/:id            → 删除会话及其所有消息
POST   /api/sessions/:id/export     → 导出会话（JSON/MD）

GET    /api/sessions/:id/messages   → 拉取历史消息（分页）

GET    /api/memories                → 查看记忆（支持layer/scene筛选）
POST   /api/memories                → 新增记忆
PUT    /api/memories/:id            → 编辑记忆
DELETE /api/memories/:id            → 删除记忆

GET    /api/summaries               → 查看中期摘要
```

---

# Part 2：Gateway 后端扩展

## 2.1 设计原则

- **向下兼容**：Kelivo现有连接不受影响
- **代理商无关**：前端不感知后端用哪个代理商
- **模型无关**：支持动态模型列表
- **异步优先**：所有存储操作不阻塞流式响应

## 2.2 鉴权（双层防护）

### 第一层：Nginx HTTP Basic Auth

```
# 生成密码文件
# htpasswd -c /etc/nginx/.htpasswd dream

# 在 /api/ 和 /chat/ 的location块中：
auth_basic "Private Area";
auth_basic_user_file /etc/nginx/.htpasswd;
```

零CPU消耗，直接在Nginx层拦截所有未授权访问。

### 第二层：JWT应用鉴权

```python
# .env
AUTH_PASSWORD=你设的密码
JWT_SECRET=随机字符串32位以上
JWT_EXPIRE_DAYS=7
```

```
POST /api/auth/login
  Request:  { "password": "xxx" }
  Response: { "token": "eyJ...", "expires_at": "2026-03-08T17:00:00Z" }
  失败:     401 { "error": "密码错误" }
```

```python
async def auth_middleware(request):
    path = request.url.path

    whitelist = ["/api/auth/login", "/health", "/models"]

    # Kelivo兼容：没带X-Session-Id的/v1/请求不校验
    if path.startswith("/v1/") and "X-Session-Id" not in request.headers:
        return

    # /api/开头的都要校验（除白名单）
    if path.startswith("/api/") and path not in whitelist:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        verify_jwt(token)
```

### 安全加固

```python
# 关闭FastAPI文档（生产环境）
app = FastAPI(
    title="LTalk Gateway",
    docs_url=None if os.getenv("ENV") == "prod" else "/hidden-docs",
    redoc_url=None
)
```

```
Supabase：
  为所有表开启RLS（Row Level Security）
  不编写公开Policy
  只有Service Role Key（Gateway持有）才能读写
```

## 2.3 多代理商通道管理

### 通道配置

```python
CHANNELS = {
    "deepseek": {
        "provider": "openai_compatible",
        "base_url": "<https://api.deepseek.com/v1>",
        "api_key": "sk-xxx",
        "models": ["deepseek-chat", "deepseek-reasoner"],
        "supports_thinking": False,
    },
    "dzzi": {
        "provider": "openai_compatible",
        "base_url": "<https://dzzi代理地址/v1>",
        "api_key": "sk-xxx",
        "models": ["claude-sonnet-4-20250514"],
        "supports_thinking": True,
        "thinking_format": "native",
    },
    "openrouter": {
        "provider": "openrouter",
        "base_url": "<https://openrouter.ai/api/v1>",
        "api_key": "sk-or-xxx",
        "models": ["anthropic/claude-sonnet-4", "anthropic/claude-opus-4"],
        "supports_thinking": True,
        "thinking_format": "openai",
    },
}
```

### 新代理商接入流程

```
1. 在CHANNELS加一个配置块
2. 确认thinking_format是 native / openai / wrapped 哪种
3. 如果全新格式，在adapters.py加一个adapt_xxx函数
4. 完成。前端不需要任何改动。
```

### 模型列表接口

```
GET /models
Response: {
    "models": [
        {"id": "claude-sonnet-4", "name": "Claude Sonnet 4",
         "channel": "dzzi", "supports_thinking": true},
        {"id": "claude-opus-4", "name": "Claude Opus 4",
         "channel": "openrouter", "supports_thinking": true},
        {"id": "deepseek-chat", "name": "DeepSeek V3",
         "channel": "deepseek", "supports_thinking": false}
    ]
}
```

## 2.4 流式传输与Thinking适配

### 统一输出格式（前端只认这一种）

```
data: {"type":"thinking_start"}\\n\\n
data: {"type":"thinking_delta","content":"让我想想..."}\\n\\n
data: {"type":"thinking_end"}\\n\\n
data: {"type":"text_start"}\\n\\n
data: {"type":"text_delta","content":"你好呀"}\\n\\n
data: {"type":"text_end"}\\n\\n
data: {"type":"tool_start","name":"search_memory"}\\n\\n
data: {"type":"tool_result","name":"search_memory","content":"..."}\\n\\n
data: {"type":"done","usage":{"input_tokens":0,"output_tokens":0}}\\n\\n
```

### 适配器

```python
# adapters.py

class ThinkingAdapter:
    @staticmethod
    def adapt(chunk, thinking_format):
        if thinking_format == "native":
            return adapt_native_claude(chunk)
        elif thinking_format == "openai":
            return adapt_openai_compatible(chunk)
        elif thinking_format == "wrapped":
            return adapt_wrapped(chunk)

def adapt_native_claude(chunk):
    """Claude原生格式 → 统一格式"""
    if chunk.get("type") == "content_block_start":
        block_type = chunk["content_block"]["type"]
        if block_type == "thinking":
            return {"type": "thinking_start"}
        elif block_type == "text":
            return {"type": "text_start"}
    elif chunk.get("type") == "content_block_delta":
        delta = chunk["delta"]
        if delta.get("type") == "thinking_delta":
            return {"type": "thinking_delta", "content": delta["thinking"]}
        elif delta.get("type") == "text_delta":
            return {"type": "text_delta", "content": delta["text"]}
    elif chunk.get("type") == "content_block_stop":
        return {"type": "thinking_end"}

def adapt_openai_compatible(chunk):
    """OpenAI兼容格式（OpenRouter等）→ 统一格式"""
    delta = chunk.get("choices", [{}])[0].get("delta", {})
    if "reasoning" in delta or "reasoning_content" in delta:
        content = delta.get("reasoning") or delta.get("reasoning_content")
        return {"type": "thinking_delta", "content": content}
    elif "content" in delta:
        return {"type": "text_delta", "content": delta["content"]}
```

### 流式处理主函数

```python
async def stream_and_store(upstream_response, session_id, channel_config):
    thinking_buffer = []
    text_buffer = []
    adapter = ThinkingAdapter()

    async for raw_chunk in upstream_response:
        unified = adapter.adapt(raw_chunk, channel_config["thinking_format"])
        if not unified:
            continue

        if unified["type"] == "thinking_delta":
            thinking_buffer.append(unified["content"])
        elif unified["type"] == "text_delta":
            text_buffer.append(unified["content"])

        yield f"data: {json.dumps(unified)}\\n\\n"

    yield f'data: {{"type":"done"}}\\n\\n'

    # 异步存储，不阻塞最后一个事件
    asyncio.create_task(store_message(
        session_id=session_id,
        role="assistant",
        content="".join(text_buffer),
        thinking="".join(thinking_buffer),
        thinking_policy=THINKING_POLICY.get(scene_type, "store_summary"),
    ))
```

## 2.5 对话接口

```
POST /v1/chat/completions

Headers:
  Authorization: Bearer eyJ...       (LTalk必须)
  X-Session-Id: uuid                  (LTalk必须)

Body:
{
    "model": "claude-sonnet-4",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
}
```

```python
async def chat_completions(request, background_tasks: BackgroundTasks):
    session_id = request.headers.get("X-Session-Id")

    if session_id:
        # === LTalk新流程 ===
        verify_jwt(request)
        session = await get_session(session_id)

        # context_builder独立模块构建上下文
        context = await build_context(session_id, user_input)
        messages = context + [latest_user_message]
    else:
        # === Kelivo旧流程（不变）===
        messages = request.body["messages"]

    channel = resolve_channel(model_name)
    upstream = await forward_to_upstream(channel, messages)

    return StreamingResponse(
        stream_and_store(upstream, session_id, channel),
        media_type="text/event-stream"
    )
```

## 2.6 消息存储

```python
async def store_message(session_id, role, content, thinking=None,
                        thinking_policy="store_summary"):
    # 处理thinking存储策略
    stored_thinking = None
    stored_thinking_summary = None

    if thinking:
        if thinking_policy == "store_full":
            stored_thinking = thinking
        elif thinking_policy == "store_summary":
            stored_thinking_summary = await quick_summarize(thinking, max_tokens=200)
        # "discard" → 都不存

    record = {
        "session_id": session_id,
        "role": role,
        "content": content,
        "thinking": stored_thinking,
        "thinking_summary": stored_thinking_summary,
        "scene_type": (await get_session(session_id)).scene_type,
        "token_count": count_tokens(content),
        "model": model_name,
        "created_at": now(),
    }

    await supabase.table("conversations").insert(record)

    # 异步生成embedding
    asyncio.create_task(generate_embedding(record))

    # 异步更新session统计
    asyncio.create_task(update_session_stats(session_id))
```

## 2.7 Gateway新增依赖

```
PyJWT              — JWT签发验证
APScheduler        — 定时任务（轻量化使用）
```

## 2.8 预留接口

```
POST /api/artifacts           — Phase 3
GET  /api/artifacts/:id       — Phase 3
PUT  /api/artifacts/:id       — Phase 3

POST /api/upload              — Phase 2（文件上传）
POST /api/stt                 — Phase 4（语音转文字）
POST /api/tts                 — Phase 4（文字转语音）

POST /api/export/all          — Phase 2（全量导出）
```

---

# Part 3：前端架构

## 3.1 技术栈

```
React 18           — UI框架
TypeScript         — 类型安全
Vite               — 构建工具
Tailwind CSS 4     — 样式
Zustand            — 状态管理
react-markdown     — Markdown渲染
rehype-highlight   — 代码高亮
```

## 3.2 布局

```
┌──────────┬────────────────────────┬──────────────┐
│          │     顶栏                │              │
│  侧边栏   │  模型选择 / 场景切换    │  Artifacts   │
│          ├────────────────────────┤  （Phase 3）  │
│  会话列表  │                        │              │
│  场景分组  │     聊天主区域          │  代码编辑     │
│  新建对话  │  thinking / 消息 / 工具  │  预览面板     │
│  设置入口  ├────────────────────────┤  默认隐藏     │
│          │      输入区域            │              │
│          │  文本框 / 上传 / 发送    │              │
└──────────┴────────────────────────┴──────────────┘
```

Phase 1 只做左两栏，Artifacts面板Phase 3加入。
Phase 1 不做手机端响应式，先保证电脑端好用。

## 3.3 项目结构

```
ltalk/
├── public/
│   └── favicon.ico
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   │
│   ├── api/
│   │   ├── client.ts               # 请求封装（带JWT）
│   │   ├── auth.ts
│   │   ├── sessions.ts
│   │   ├── messages.ts
│   │   ├── chat.ts                  # SSE流式处理
│   │   └── memories.ts
│   │
│   ├── stores/
│   │   ├── authStore.ts
│   │   ├── sessionStore.ts
│   │   ├── chatStore.ts
│   │   ├── uiStore.ts
│   │   └── artifactStore.ts         # Phase 3
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopBar.tsx
│   │   │   └── MainLayout.tsx
│   │   │
│   │   ├── chat/
│   │   │   ├── ChatArea.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ThinkingBlock.tsx
│   │   │   ├── ToolCallBlock.tsx
│   │   │   ├── CodeBlock.tsx
│   │   │   ├── InputArea.tsx
│   │   │   └── StreamIndicator.tsx
│   │   │
│   │   ├── sidebar/
│   │   │   ├── SessionList.tsx
│   │   │   ├── SessionItem.tsx
│   │   │   ├── SceneFilter.tsx
│   │   │   └── NewChatButton.tsx
│   │   │
│   │   ├── memory/                  # Phase 2
│   │   │   ├── MemoryPanel.tsx
│   │   │   ├── MemoryItem.tsx
│   │   │   └── MemoryEditor.tsx
│   │   │
│   │   ├── artifact/                # Phase 3
│   │   │   ├── ArtifactPanel.tsx
│   │   │   ├── ArtifactHeader.tsx
│   │   │   ├── ArtifactTabs.tsx
│   │   │   ├── ArtifactCard.tsx
│   │   │   ├── CodeEditor.tsx
│   │   │   ├── PreviewRenderer.tsx
│   │   │   └── VersionSelect.tsx
│   │   │
│   │   └── common/
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       ├── Loading.tsx
│   │       └── Toast.tsx
│   │
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   └── ChatPage.tsx
│   │
│   ├── hooks/
│   │   ├── useSSE.ts
│   │   ├── useAuth.ts
│   │   └── useMediaQuery.ts
│   │
│   ├── utils/
│   │   ├── markdown.ts
│   │   ├── parseArtifacts.ts        # Phase 3
│   │   ├── format.ts
│   │   └── tokens.ts
│   │
│   ├── types/
│   │   ├── session.ts
│   │   ├── message.ts
│   │   ├── memory.ts
│   │   ├── stream.ts
│   │   └── artifact.ts             # Phase 3
│   │
│   └── styles/
│       └── globals.css
│
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── .env
```

## 3.4 类型定义

```tsx
// types/session.ts
interface Session {
    id: string;
    title: string;
    model: string;
    scene_type: 'daily' | 'code' | 'roleplay' | 'reading';
    message_count: number;
    created_at: string;
    updated_at: string;
}

// types/message.ts
interface Message {
    id: string;
    session_id: string;
    role: 'user' | 'assistant';
    content: string;
    thinking?: string;
    thinking_summary?: string;
    model?: string;
    token_count?: number;
    created_at: string;
}

// types/stream.ts
type StreamEvent =
    | { type: 'thinking_start' }
    | { type: 'thinking_delta'; content: string }
    | { type: 'thinking_end' }
    | { type: 'text_start' }
    | { type: 'text_delta'; content: string }
    | { type: 'text_end' }
    | { type: 'tool_start'; name: string }
    | { type: 'tool_result'; name: string; content: string }
    | { type: 'done'; usage?: { input_tokens: number; output_tokens: number } };

// types/memory.ts
interface Memory {
    id: string;
    content: string;
    layer: 'core_base' | 'core_living' | 'scene';
    scene_type?: string;
    source: 'manual' | 'auto' | 'diary';
    created_at: string;
    updated_at: string;
}

// types/artifact.ts (Phase 3)
interface Artifact {
    id: string;
    session_id: string;
    message_id?: string;
    type: 'code' | 'html' | 'svg' | 'markdown' | 'csv' | 'mermaid';
    title: string;
    language?: string;
    content: string;
    version: number;
    parent_id?: string;
    created_at: string;
}
```

## 3.5 状态管理

```tsx
// stores/authStore.ts
interface AuthStore {
    token: string | null;
    isLoggedIn: boolean;
    login: (password: string) => Promise<boolean>;
    logout: () => void;
}

// stores/sessionStore.ts
interface SessionStore {
    sessions: Session[];
    currentSession: Session | null;
    sceneFilter: string | null;

    fetchSessions: () => Promise<void>;
    createSession: (scene: string, model: string) => Promise<Session>;
    selectSession: (id: string) => Promise<void>;
    deleteSession: (id: string) => Promise<void>;
    renameSession: (id: string, title: string) => Promise<void>;
    setSceneFilter: (scene: string | null) => void;
}

// stores/chatStore.ts
interface ChatStore {
    messages: Message[];
    isStreaming: boolean;
    currentThinking: string;
    currentText: string;

    loadMessages: (sessionId: string) => Promise<void>;
    sendMessage: (content: string) => Promise<void>;
    stopStreaming: () => void;
    clearMessages: () => void;
}

// stores/uiStore.ts
interface UIStore {
    sidebarOpen: boolean;
    artifactOpen: boolean;
    theme: 'light' | 'dark';

    toggleSidebar: () => void;
    toggleArtifact: () => void;
    setTheme: (theme: string) => void;
}
```

## 3.6 核心流程：SSE流式对话

```tsx
// hooks/useSSE.ts
async function streamChat(sessionId: string, content: string) {
    const chatStore = useChatStore.getState();
    chatStore.setStreaming(true);

    const response = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Session-Id': sessionId,
        },
        body: JSON.stringify({
            model: currentSession.model,
            messages: [{ role: 'user', content }],
            stream: true,
        }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\\n');

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') break;

            const event: StreamEvent = JSON.parse(data);

            switch (event.type) {
                case 'thinking_delta':
                    chatStore.appendThinking(event.content);
                    break;
                case 'text_delta':
                    chatStore.appendText(event.content);
                    break;
                case 'tool_start':
                    chatStore.setToolStatus(event.name, 'running');
                    break;
                case 'tool_result':
                    chatStore.setToolStatus(event.name, 'done');
                    break;
                case 'done':
                    chatStore.finalizeMessage(event.usage);
                    break;
            }
        }
    }

    chatStore.setStreaming(false);
}
```

## 3.7 核心组件

### ThinkingBlock

```tsx
function ThinkingBlock({ content, isStreaming }: Props) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="border-l-2 border-amber-300 bg-amber-50
                        dark:bg-amber-900/20 rounded-r-lg my-2">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 px-3 py-2 w-full
                          text-sm text-amber-700 dark:text-amber-300">
                {isStreaming ? <SpinnerIcon /> : <ChevronIcon rotated={expanded} />}
                <span>思考过程</span>
                {isStreaming && <span className="animate-pulse">思考中...</span>}
            </button>

            {(expanded || isStreaming) && (
                <div className="px-4 pb-3 text-sm text-gray-600
                              dark:text-gray-400 whitespace-pre-wrap">
                    {content}
                </div>
            )}
        </div>
    );
}
```

### NewChatButton（含场景继承）

```tsx
function NewChatButton() {
    const [showSceneSelect, setShowSceneSelect] = useState(false);
    const { currentSession } = useSessionStore();

    const scenes = [
        { key: 'daily',    icon: '🏠', label: '日常' },
        { key: 'code',     icon: '💻', label: '代码' },
        { key: 'roleplay', icon: '🎭', label: '剧本' },
        { key: 'reading',  icon: '📚', label: '阅读' },
    ];

    // 默认高亮上一个session的场景
    const defaultScene = currentSession?.scene_type || 'daily';

    const handleCreate = async (scene: string) => {
        const session = await sessionStore.createSession(scene, defaultModel);
        sessionStore.selectSession(session.id);
        setShowSceneSelect(false);
    };

    return (
        <>
            <button onClick={() => setShowSceneSelect(true)}
                    className="w-full py-3 flex items-center gap-2
                             hover:bg-gray-100 rounded-lg px-3">
                <PlusIcon /> 新对话
            </button>

            {showSceneSelect && (
                <div className="grid grid-cols-2 gap-2 p-2">
                    {scenes.map(s => (
                        <button key={s.key} onClick={() => handleCreate(s.key)}
                                className={`flex flex-col items-center p-3 rounded-lg
                                    ${s.key === defaultScene
                                        ? 'bg-blue-100 ring-2 ring-blue-400'
                                        : 'hover:bg-gray-100'}`}>
                            <span className="text-2xl">{s.icon}</span>
                            <span className="text-sm">{s.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}
```

## 3.8 页面路由

```tsx
function App() {
    return (
        <Routes>
            <Route path="/chat/login" element={<LoginPage />} />
            <Route path="/chat" element={
                <AuthGuard><ChatPage /></AuthGuard>
            } />
            <Route path="/chat/:sessionId" element={
                <AuthGuard><ChatPage /></AuthGuard>
            } />
        </Routes>
    );
}
```

## 3.9 环境配置

```bash
# .env.development
VITE_API_BASE_URL=http://localhost:8001

# .env.production
VITE_API_BASE_URL=/api
```

```tsx
// vite.config.ts
export default defineConfig({
    plugins: [react()],
    base: '/chat/',
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: '<https://kdreamling.work>',
                changeOrigin: true,
                secure: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
    },
});
```

---

# Part 4：Artifacts 系统

## 4.1 Artifact类型

```
code       — 代码文件（Python/JS/TS/CSS/SQL等）
html       — 可预览的网页
svg        — 矢量图形
markdown   — 长文档/文章/小说章节
csv        — 数据表格
mermaid    — 流程图/架构图
```

## 4.2 触发机制（双格式兜底）

### System Prompt注入

```python
ARTIFACT_INSTRUCTION = """
当你需要生成以下内容时，请使用 <artifact> 标签包裹：
- 超过15行的代码
- 完整的HTML页面
- SVG图形
- 长文档或文章
- 数据表格
- 流程图（mermaid语法）

格式：
<artifact type="类型" title="标题" language="语言">
内容
</artifact>

更新已有artifact时，加上ref属性：
<artifact type="html" title="标题" ref="原artifact_id" version="2">
修改后的完整内容
</artifact>

支持的type: code, html, svg, markdown, csv, mermaid
短代码片段（少于15行）直接用代码块，不需要artifact。
"""
```

### 前端双格式解析

```tsx
// utils/parseArtifacts.ts

function parseArtifacts(content: string): ParseResult {
    // 第一优先：尝试XML标签格式
    let result = parseXMLArtifacts(content);

    // 如果XML解析失败或未找到，尝试JSON block格式
    if (result.artifacts.length === 0) {
        result = parseJSONArtifacts(content);
    }

    return result;
}

function parseXMLArtifacts(content: string): ParseResult {
    const regex = /<artifact\\s+type="(\\w+)"\\s+title="([^"]+)"(?:\\s+language="([^"]+)")?(?:\\s+ref="([^"]+)")?(?:\\s+version="(\\d+)")?\\s*>([\\s\\S]*?)<\\/artifact>/g;
    // ... 解析逻辑
}

function parseJSONArtifacts(content: string): ParseResult {
    const regex = /```artifact\\n(\\{[\\s\\S]*?\\})\\n```/g;
    // ... 解析JSON block
}
```

## 4.3 数据库

```sql
CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    message_id UUID,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    language TEXT,
    content TEXT NOT NULL,
    version INT DEFAULT 1,
    parent_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_art_session ON artifacts(session_id);
CREATE INDEX idx_art_parent ON artifacts(parent_id);
```

## 4.4 API

```
POST   /api/artifacts                → 创建
GET    /api/artifacts/:id            → 获取
GET    /api/artifacts/:id/versions   → 历史版本列表
PUT    /api/artifacts/:id            → 更新（version+1）
DELETE /api/artifacts/:id            → 删除
GET    /api/sessions/:id/artifacts   → 会话下所有artifacts
POST   /api/artifacts/:id/download   → 下载为文件
```

## 4.5 前端组件

### ArtifactPanel（右侧面板）

```tsx
function ArtifactPanel() {
    const { currentArtifact, isOpen } = useArtifactStore();
    if (!isOpen || !currentArtifact) return null;

    return (
        <div className="w-[500px] border-l h-full flex flex-col
                        animate-slide-in-right">
            <ArtifactHeader
                title={currentArtifact.title}
                type={currentArtifact.type}
                version={currentArtifact.version}
            />
            <ArtifactTabs
                type={currentArtifact.type}
                content={currentArtifact.content}
                language={currentArtifact.language}
            />
        </div>
    );
}
```

### ArtifactTabs（代码/预览切换）

```tsx
function ArtifactTabs({ type, content, language }: Props) {
    const [activeTab, setActiveTab] = useState<'code' | 'preview'>('preview');
    const previewable = ['html', 'svg', 'mermaid', 'csv', 'markdown'];
    const canPreview = previewable.includes(type);

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {canPreview && (
                <div className="flex border-b">
                    <TabButton active={activeTab === 'code'}
                              onClick={() => setActiveTab('code')}>代码</TabButton>
                    <TabButton active={activeTab === 'preview'}
                              onClick={() => setActiveTab('preview')}>预览</TabButton>
                </div>
            )}
            <div className="flex-1 overflow-auto">
                {activeTab === 'code' || !canPreview ? (
                    <CodeEditor content={content} language={language} />
                ) : (
                    <PreviewRenderer type={type} content={content} />
                )}
            </div>
        </div>
    );
}
```

### PreviewRenderer

```tsx
function PreviewRenderer({ type, content }: Props) {
    switch (type) {
        case 'html':    return <HTMLPreview content={content} />;
        case 'svg':     return <SVGPreview content={content} />;
        case 'mermaid': return <MermaidPreview content={content} />;
        case 'csv':     return <CSVPreview content={content} />;
        case 'markdown': return <MarkdownPreview content={content} />;
    }
}

// HTML预览：iframe沙箱隔离
function HTMLPreview({ content }: Props) {
    const ref = useRef<HTMLIFrameElement>(null);
    useEffect(() => {
        const doc = ref.current?.contentDocument;
        doc?.open(); doc?.write(content); doc?.close();
    }, [content]);

    return <iframe ref={ref} sandbox="allow-scripts allow-modals"
                   className="w-full h-full border-0 bg-white" />;
}
```

### ArtifactCard（聊天区卡片）

```tsx
function ArtifactCard({ artifact }: Props) {
    const typeConfig = {
        code: { icon: '📄', color: 'blue' },
        html: { icon: '🌐', color: 'green' },
        svg:  { icon: '🎨', color: 'purple' },
        markdown: { icon: '📝', color: 'amber' },
        csv:  { icon: '📊', color: 'cyan' },
        mermaid: { icon: '📐', color: 'indigo' },
    };

    return (
        <div onClick={() => openArtifact(artifact)}
             className="border rounded-xl p-4 my-3 cursor-pointer
                       hover:shadow-md max-w-[400px]">
            <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{typeConfig[artifact.type].icon}</span>
                <span className="font-medium">{artifact.title}</span>
            </div>
            <span className="text-sm text-gray-500">
                {artifact.language} · v{artifact.version} · 点击查看 →
            </span>
        </div>
    );
}
```

### 写作间（特殊Markdown Artifact）

```tsx
function WritingMode({ artifact }: Props) {
    return (
        <div className="flex h-full">
            <div className="w-1/2 border-r">
                <CodeMirror value={artifact.content} extensions={[markdown()]} />
            </div>
            <div className="w-1/2 overflow-auto p-6 prose dark:prose-invert">
                <MarkdownRenderer content={artifact.content} />
            </div>
        </div>
    );
}
```

## 4.6 前端新增依赖

```json
{
    "@uiw/react-codemirror": "^4.x",
    "@codemirror/lang-javascript": "^6.x",
    "@codemirror/lang-python": "^6.x",
    "@codemirror/lang-html": "^6.x",
    "@codemirror/lang-css": "^6.x",
    "@codemirror/lang-sql": "^6.x",
    "@codemirror/lang-markdown": "^6.x",
    "mermaid": "^10.x",
    "dompurify": "^3.x"
}
```

## 4.7 安全

```
HTML预览：iframe sandbox="allow-scripts allow-modals"
         不允许 allow-same-origin / allow-top-navigation
SVG渲染：DOMPurify清理后再渲染
用户编辑：保存为新版本，不覆盖原版
```

---

# Part 5：部署与运维

## 5.1 服务器现状

```
硬件：2核CPU / 2GB内存 / 阿里云ECS
已运行：Gateway(8001) + MCP(8002) + 日记API(8003) + Nginx(80/443)
外部依赖：Supabase + DZZI + DeepSeek + OpenRouter(预留)
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
                    │  /mcp/*   → :8002   │
                    │  /diary/* → :8003   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼──────────────┐
              ▼                ▼              ▼
      ┌──────────────┐ ┌──────────┐ ┌──────────────┐
      │ Gateway 8001 │ │ MCP 8002 │ │ 日记API 8003 │
      │  JWT鉴权     │ └──────────┘ └──────────────┘
      │  会话管理     │
      │  流式转发     │
      │  记忆注入     │
      │  thinking适配 │
      │  实时微摘要   │
      │  定时任务     │
      └──────┬───────┘
             │
    ┌────────┼────────┬──────────┐
    ▼        ▼        ▼          ▼
Supabase   DZZI   DeepSeek  OpenRouter
```

## 5.3 目录结构

```
/www/
├── website/              # 个人网站（已有）
├── chat/                 # LTalk前端（新增）
│   ├── index.html
│   ├── assets/
│   └── favicon.ico
├── gateway/              # Gateway（已有，改造）
│   ├── main.py
│   ├── context_builder.py  # 新增：独立上下文构建模块
│   ├── channels.py         # 新增：多通道配置
│   ├── adapters.py         # 新增：thinking适配器
│   ├── auth.py             # 新增：鉴权模块
│   ├── sessions.py         # 新增：会话管理
│   ├── memory_cycle.py     # 新增：实时微摘要 + 定时任务
│   ├── requirements.txt
│   └── .env
├── mcp-server/           # 晨的助手（已有）
├── diary-api/            # 日记API（已有）
├── backups/              # 备份目录（新增）
│   ├── 2026-03-01.json
│   └── weekly/
└── logs/                 # 日志目录（新增）
    └── gateway.log
```

## 5.4 Nginx 完整配置

```
server {
    listen 80;
    server_name kdreamling.work;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name kdreamling.work;

    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # ====== 个人网站（无Basic Auth）======
    location / {
        root /www/website;
        index index.html;
    }

    # ====== LTalk前端（Basic Auth保护）======
    location /chat/ {
        auth_basic "Private Area";
        auth_basic_user_file /etc/nginx/.htpasswd;

        alias /www/chat/;
        try_files $uri $uri/ /chat/index.html;

        location ~* \\.(js|css|png|jpg|ico|svg|woff2)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # ====== Gateway API（Basic Auth保护）======
    location /api/ {
        auth_basic "Private Area";
        auth_basic_user_file /etc/nginx/.htpasswd;

        proxy_pass <http://127.0.0.1:8001/>;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Connection '';

        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # ====== Kelivo兼容（不加Basic Auth）======
    location /v1/ {
        proxy_pass <http://127.0.0.1:8001/v1/>;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_read_timeout 300s;
    }

    # ====== MCP ======
    location /mcp/ {
        proxy_pass <http://127.0.0.1:8002/>;
    }

    # ====== 日记API ======
    location /diary/ {
        proxy_pass <http://127.0.0.1:8003/>;
    }
}
```

## 5.5 开发工作流

```bash
# 本地开发
git clone <https://github.com/Kdreamling/ltalk.git>
cd ltalk
npm install
npm run dev    # → <http://localhost:5173/chat/>

# 构建
npm run build  # → dist/

# 部署（手动）
scp -r dist/* root@服务器:/www/chat/
ssh root@服务器 "nginx -s reload"
```

### GitHub Actions自动部署（可选）

```yaml
# .github/workflows/deploy.yml
name: Deploy LTalk
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build
      - name: Deploy
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: root
          key: ${{ secrets.SSH_KEY }}
          source: "dist/*"
          target: "/www/chat/"
          strip_components: 1
      - name: Reload Nginx
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: root
          key: ${{ secrets.SSH_KEY }}
          script: nginx -s reload
```

## 5.6 备份策略

### 每日备份（定时任务）

```python
async def daily_backup():
    """每天凌晨3点"""
    today = date.today().isoformat()

    conversations = await supabase.table("conversations") \\
        .select("*").gte("created_at", f"{today}T00:00:00").execute()
    memories = await supabase.table("memories") \\
        .select("*").gte("updated_at", f"{today}T00:00:00").execute()

    backup = {
        "date": today,
        "conversations": conversations.data,
        "memories": memories.data,
    }

    # 本地保存
    path = f"/www/backups/{today}.json"
    with open(path, 'w') as f:
        json.dump(backup, f, ensure_ascii=False, indent=2)

    # 云端双保险
    await upload_to_cloud(path)
```

### 云存储

```python
# 方案A：GitHub Private Repo
async def upload_to_github(file_path):
    content = base64.b64encode(open(file_path, 'rb').read()).decode()
    filename = os.path.basename(file_path)
    await httpx.put(
        f"<https://api.github.com/repos/{BACKUP_REPO}/contents/backups/{filename}>",
        headers={"Authorization": f"token {GITHUB_TOKEN}"},
        json={"message": f"backup {filename}", "content": content}
    )

# 方案B：阿里云OSS
async def upload_to_oss(file_path):
    import oss2
    auth = oss2.Auth(OSS_KEY, OSS_SECRET)
    bucket = oss2.Bucket(auth, OSS_ENDPOINT, OSS_BUCKET)
    filename = os.path.basename(file_path)
    bucket.put_object_from_file(f"ltalk-backup/{filename}", file_path)
```

### 手动导出

```
POST /api/sessions/:id/export  → 单个会话导出（JSON/MD）
POST /api/export/all           → 全量导出（zip）
```

## 5.7 性能保障（2G内存）

```
当前占用约650MB，剩余1350MB
LTalk前端 = 纯静态文件，不占服务器内存

优化措施：
  ✅ 实时微摘要均摊CPU，不集中爆发
  ✅ embedding异步生成，不阻塞主流程
  ✅ 批处理强制分页 + asyncio.sleep让出CPU
  ✅ uvicorn --workers 1（不开多worker）
  ✅ thinking按策略存储，减少DB膨胀
  ✅ 每周可选自动重启Gateway进程
```

```python
# 批处理分页模板
async def batch_process(table, handler):
    limit, offset = 50, 0
    while True:
        records = await fetch_batch(table, limit, offset)
        if not records: break
        await handler(records)
        offset += limit
        await asyncio.sleep(0.5)  # 强制让出CPU
```

## 5.8 监控与日志

```python
import logging

logging.basicConfig(
    filename='/www/logs/gateway.log',
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)

logger.info(f"[AUTH] login success")
logger.info(f"[CHAT] session={sid} model={model} tokens={usage}")
logger.info(f"[MEMORY] micro_summary: {type} → {layer}")
logger.info(f"[BACKUP] saved: {filename}")
logger.error(f"[ERROR] upstream timeout: {channel}")
```

```
# /etc/logrotate.d/ltalk
/www/logs/gateway.log {
    daily
    rotate 30
    compress
    missingok
    notifempty
}
```

## 5.9 定时任务汇总

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

# 每周日凌晨1点：滚动重建中期摘要
scheduler.add_job(rebuild_all_merged_summaries, 'cron',
                  day_of_week='sun', hour=1, minute=0)

# 每日凌晨3点：数据备份
scheduler.add_job(daily_backup, 'cron', hour=3, minute=0)

# 每月1日凌晨4点：旧对话归档
scheduler.add_job(monthly_archive, 'cron', day=1, hour=4, minute=0)

@app.on_event("startup")
async def startup():
    scheduler.start()
```

注意：中期记忆的主要更新已由实时微摘要承担，定时任务仅做周期性整合。

## 5.10 安全清单

```
✅ HTTPS（已有，Nginx SSL）
✅ Nginx HTTP Basic Auth（第一道门）
✅ JWT应用鉴权（第二道门）
✅ FastAPI文档关闭（生产环境）
✅ Supabase RLS（行级安全）
✅ API Key不暴露给前端
✅ iframe sandbox（Artifacts预览）
✅ DOMPurify（SVG清理）
✅ CORS白名单
✅ 密码存环境变量
✅ 日志不记录敏感内容
✅ 备份目录不对外暴露
```

## 5.11 域名路由总览

```
<https://kdreamling.work/>            → 个人网站首页
<https://kdreamling.work/chat/>       → LTalk前端（Basic Auth）
<https://kdreamling.work/api/>        → Gateway API（Basic Auth + JWT）
<https://kdreamling.work/v1/>         → Gateway（Kelivo兼容，无Auth）
<https://kdreamling.work/mcp/>        → MCP服务器
<https://kdreamling.work/diary/>      → 日记API
```

---

# 开发顺序

```
Phase 0：后端改造
  ├── ✅ 数据库表改造（sessions / memory_summaries / conversations / memories）
  ├── ✅ context_builder.py 独立模块
  ├── ✅ 鉴权（Basic Auth + JWT）
  ├── ✅ 会话CRUD API
  ├── ✅ 多通道配置 + thinking适配器
  ├── ✅ 实时微摘要
  ├── ✅ 安全加固（RLS / 关闭docs）
  └── ✅ 备份定时任务

Phase 1：HTML Demo → React基础版
  ├── ✅ HTML Demo验证核心链路（流式/thinking/鉴权）
  ├── ✅ React：流式对话 + Markdown + 代码高亮
  ├── ✅ React：ThinkingBlock可折叠
  ├── ✅ React：会话管理 + 场景切换
  ├── ✅ React：模型切换
  └── ✅ React：基本好看的界面

Phase 2：增强
  ├── 文件上传（图片/文档）
  ├── ✅ 记忆面板UI（MemoryPanel）
  ├── 对话导出
  └── 全量备份导出

Phase 3：Artifacts
  ├── Artifact解析 + 右侧面板
  ├── 代码编辑器（CodeMirror）
  ├── HTML/SVG/Mermaid预览
  ├── 版本管理
  ├── 文件下载
  └── 写作间

Phase 4：生活功能
  ├── 语音输入/朗读（留位置）
  ├── 历史对话搜索
  ├── 主动消息系统
  ├── Web Push通知
  └── ✅ 手机端响应式（已完成，见下方详情）

── 手机端响应式详情 ────────────────────────────────
  ✅ 侧边栏抽屉（hamburger + 右滑开 / 左滑关 / 遮罩点击关）
  ✅ iOS safe-area-inset-top / bottom 全面适配
  ✅ visualViewport API 键盘弹出检测
  ✅ height: 100dvh（Safari 兼容）
  ✅ Settings / Memory / Features / Debug 面板手机全屏
  ✅ PWA manifest + Apple meta tags
  ✅ 气泡输入框（未聚焦胶囊 ↔ 聚焦展开，textarea 自动增高）
  ✅ 消息内联操作（Copy / Delete 图标，替代长按弹层）
  ✅ 30s SSE 超时 + 错误提示 + 重试
  ✅ 消息删除 API（DELETE /sessions/{id}/messages/{conv_id}）
  ✅ body 背景 #fafbfd（修复 iOS safe-area 漏白）
  ✅ 重命名空白输入框（autoFocus + placeholder，规避 iOS 全选）
──────────────────────────────────────────────────────
```

---