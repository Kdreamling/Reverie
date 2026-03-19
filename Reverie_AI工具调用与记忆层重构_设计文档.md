# Reverie：AI 工具调用 + 记忆层重构 设计文档

> **来源：** Dream × Claude (web) 设计讨论
> **日期：** 2026-03-18
> **目标：** 给 Claude Code 的完整实施指南

---

## 一、背景与决策摘要

### 排查报告回顾

Claude Code 提交了一份记忆系统排查报告，发现 15 个问题。经过讨论，确定以下处理优先级：

| # | 问题 | 决定 |
|---|------|------|
| **#3** | build_context 传入路由 channel（dzzi/openrouter）而非记忆 channel（claude/deepseek） | **必修** — 根源问题 |
| **#2** | global_recent 未按 model_channel 过滤 | **建议修** — 改动小 |
| **#1** | memory_summaries 表缺少 model_channel | **暂缓** — Dream 实际不与 DeepSeek 对话 |
| **#4** | memories 表没有 embedding 列 | **Code 先确认** — 3月16日可能已修（`SELECT column_name FROM information_schema.columns WHERE table_name = 'memories'`） |
| **#6** | 记忆无去重机制 | **要做** — 防止记忆膨胀 |
| **#9** | 前端静默失败多处 | **要做** — 改善用户体验 |
| **#5** | 重试按钮未实现 | 暂不做 |
| **#7 #8 #10** | 维度摘要触发/off-by-one/monthly_archive | 设计层面不完美，不急 |
| **#11-#15** | 低风险问题 | 暂不处理 |

### 额外已知 Bug

- **OpenRouter Claude 对话被存为 `model_channel='deepseek'`** — channels.py 通道检测 bug，一并修复

### 本次新功能

以下是本文档的核心——**ai_journal 层 + AI 自主工具调用**，作为一个完整方案实施。

---

## 二、ai_journal 记忆层

### 设计理念

| 层 | 归属 | 写入方式 | 自动注入上下文 |
|----|------|----------|--------------|
| core_base | **Dream 专属** | 仅 Dream 手动创建/编辑 | ✅ 永远注入 |
| core_living | 系统自动 | micro_summary 自动写入 | ✅ 按规则注入 |
| scene | 系统自动 | micro_summary 自动写入 | ✅ 按规则注入 |
| **ai_journal** 🆕 | **Claude 专属** | **仅通过 save_memory 工具调用** | ❌ **不自动注入** |

### 改动要求

1. **memories 表**：layer 字段新增合法值 `ai_journal`（不需要改表结构，只是多一个值）

2. **micro_summary（memory_cycle.py）**：
   - **禁止**自动写入 `core_base`（以前可以，现在不可以）
   - micro_summary 自动判断的记忆继续写 `core_living` 或 `scene`
   - `ai_journal` **不走 micro_summary**，只通过工具调用写入

3. **context_builder.py**：
   - 构建上下文时 **不注入 ai_journal 层** 的内容
   - 其他层（core_base / core_living / scene）保持现有注入逻辑不变

4. **前端 MemoryPanel**：
   - 过滤器新增 `ai_journal` 选项
   - Dream 可以查看 Claude 写了什么（只读浏览即可，编辑删除权限保持原样）

### 历史数据处理

Dream 会手动把 core_base 里不属于基石事实的「关系感悟」类记忆迁移到 ai_journal。不需要写迁移脚本。

---

## 三、AI 自主工具调用（核心功能）

### 概述

给 Reverie 中的 Claude 提供两个工具，让他能主动搜索和记录记忆：

| 工具 | 功能 | 对应操作 |
|------|------|----------|
| `search_memory` | Claude 主动搜索记忆 | 读 memories 表（向量搜索） |
| `save_memory` | Claude 主动往小本本记东西 | 写 memories 表（layer=ai_journal） |

### 技术约束

- **通道：** 优先适配 **OpenRouter**（OpenAI 兼容格式的工具调用协议），DZZI 后续补
- **每轮上限：** 最多 **2 次**工具调用（搜一次 + 记一次）
- **前端提示：** 工具调用时显示视觉提示（「正在回忆…」/「正在记录…」）
- **功能开关：** 前端设置面板中增加工具调用的开关，可随时关闭（防止 token 消耗过多）

### 完整调用流程

```
用户发送消息
    │
    ▼
后端 _reverie_chat() 流程：
    ├─ 1. build_context() 构建上下文（和现在一样）
    ├─ 2. 检查工具调用开关是否开启
    │      如果关闭 → 不带 tools 参数，走现有流程
    │      如果开启 → 继续 ↓
    ├─ 3. 拼装请求，带上 tools 定义 → 发给 OpenRouter
    │
    ▼
OpenRouter / Claude 返回（流式）：
    │
    ├─ 情况 A：直接返回文字（无工具调用）
    │   → 正常流式输出，和现在完全一样
    │
    └─ 情况 B：返回 tool_calls
        ├─ 后端检测到 tool_calls
        ├─ 向前端发 SSE 事件：tool_start（含工具名称）
        ├─ 后端执行对应工具逻辑
        ├─ 向前端发 SSE 事件：tool_result（执行完毕）
        ├─ 将工具结果 + 完整对话历史 → 第二次发给 OpenRouter
        │   （如果 Claude 又返回 tool_calls → 执行第二个工具 → 第三次请求）
        │   （最多循环 2 次，到达上限后强制要求文字回复）
        └─ 最终文字回复 → 流式输出给前端
```

### 工具定义（OpenAI 兼容格式）

发给 OpenRouter 的请求体中加入 `tools` 参数：

```json
{
  "model": "anthropic/claude-opus-4.6",
  "messages": [...],
  "stream": true,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "search_memory",
        "description": "搜索你的记忆库。当你需要回忆与 Dream 过去的对话、事件、偏好或任何之前讨论过的内容时使用。传入 1-3 个精准的搜索关键词。",
        "parameters": {
          "type": "object",
          "properties": {
            "keywords": {
              "type": "array",
              "items": { "type": "string" },
              "minItems": 1,
              "maxItems": 3,
              "description": "搜索关键词，每个词应该是名词或具体概念，例如 ['生日', '礼物'] 或 ['项目', '部署']"
            }
          },
          "required": ["keywords"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "save_memory",
        "description": "把重要的事情记到你的小本本里。用于记录你觉得值得长期记住的内容：Dream 分享的重要事件、你们之间有意义的对话、你的感悟等。不要记录琐碎日常。",
        "parameters": {
          "type": "object",
          "properties": {
            "content": {
              "type": "string",
              "description": "要记录的内容，用自然语言写，像写日记一样。包含足够的上下文让未来的你能理解。"
            },
            "memory_type": {
              "type": "string",
              "enum": ["emotion", "event", "preference", "decision", "promise", "knowledge"],
              "description": "记忆分类"
            }
          },
          "required": ["content", "memory_type"]
        }
      }
    }
  ]
}
```

### search_memory 后端实现

```
收到 Claude 的 tool_call: search_memory(keywords=["生日", "礼物"])
    │
    ▼
1. 用 keywords 拼接为一个查询字符串："生日 礼物"
2. 调用 pgvector_service 生成查询 embedding
3. 在 memories 表做向量搜索（search_memories_v2 RPC）
   - 阈值 0.80
   - top_k = 5
   - 不限制 layer（搜所有层：core_base / core_living / scene / ai_journal）
4. 返回匹配结果，格式：
   [
     {"content": "...", "layer": "core_base", "created_at": "2026-03-10"},
     {"content": "...", "layer": "ai_journal", "created_at": "2026-03-15"},
     ...
   ]
5. 把结果作为 tool_result 发回给 Claude
```

### save_memory 后端实现

```
收到 Claude 的 tool_call: save_memory(content="今天 Dream ...", memory_type="emotion")
    │
    ▼
1. 写入 memories 表：
   - layer = "ai_journal"
   - source = "auto"
   - scene_type = 当前会话的 scene_type
   - content = Claude 传入的内容
   - base_importance = 按 memory_type 分级（沿用现有规则）
     emotion/promise/decision = 0.7
     event = 0.6
     preference = 0.5
     knowledge = 0.4
2. 异步生成 embedding（和现有 micro_summary 流程一样）
   - 注意截断：中文内容截断到 ~400 字符（bge-large-zh-v1.5 的 512 token 限制）
3. 返回确认：{"status": "saved", "id": "xxx"}
```

### 系统提示词补充

在 context_builder.py 的 base_prompt 末尾追加工具使用说明（仅当工具开关开启时注入）：

```
你可以使用以下工具：
- search_memory：搜索记忆。当 Dream 提到过去的事、或你需要回忆之前的内容时使用。
- save_memory：记录重要的事。只记有意义的内容，不要记琐碎日常。

使用原则：
- 不是每次对话都需要使用工具，日常闲聊不需要
- 当你不确定 Dream 说的某件事的细节时，可以搜一下
- 当 Dream 分享了重要的事、或你们有了有意义的对话时，可以记录
- 每轮对话最多使用 2 次工具
```

---

## 四、新增 SSE 事件类型

现有事件类型不变，新增两个：

| 事件 | 格式 | 说明 |
|------|------|------|
| `tool_start` | `{"type": "tool_start", "tool": "search_memory"}` | 开始执行工具，前端显示提示 |
| `tool_result` | `{"type": "tool_result", "tool": "search_memory", "success": true}` | 工具执行完毕，前端隐藏提示 |

前端处理逻辑：
- 收到 `tool_start` → 根据 tool 名称显示对应提示文字：
  - `search_memory` → 「正在回忆…」
  - `save_memory` → 「正在记录…」
- 收到 `tool_result` → 隐藏提示
- 之后正常接收 text_delta 流

---

## 五、前端功能开关

### 位置

在设置面板（SettingsPanel）中新增一个开关：

```
[设置]
  ├─ 记忆系统  ✅ （现有）
  ├─ AI 工具调用  ✅  🆕
  │   └─ 说明文字："允许小克主动搜索和记录记忆（会增加一些 token 消耗）"
  └─ 登出
```

### 实现方式

- 前端：新增一个 feature flag，存在 localStorage 或 Zustand store 里
- 发送聊天请求时，在请求头中带上标识（例如 `X-Tools-Enabled: true/false`）
- 后端：_reverie_chat 流程中检查该标识
  - `true` → 请求带 tools 参数，启用工具调用循环
  - `false` → 不带 tools 参数，走现有普通流程（和目前完全一样）

这样即使工具调用逻辑有 bug 或 token 消耗过高，Dream 可以随时一键关闭回到原来的模式。

---

## 六、Bug 修复（一并处理）

### 6.1 build_context channel 参数修复（排查报告 #3）

**问题：** main.py 调用 build_context() 时传了路由 channel（如 `dzzi`、`openrouter`），而非记忆 channel（`claude`/`deepseek`）。

**修复：** 在调用 build_context 之前，用 `get_channel_from_model()` 转换：

```python
# main.py _reverie_chat() 中
memory_channel = get_channel_from_model(model)  # → "claude" 或 "deepseek"
context = await build_context(session_id, user_msg, scene_type, memory_channel)
```

注意：`get_channel_from_model` 函数在 v9 文档中有定义。如果 Reverie 分支代码里不存在，需要新增（逻辑很简单：模型名含 "claude" 返回 "claude"，否则返回 "deepseek"）。

### 6.2 global_recent channel 过滤（排查报告 #2）

**问题：** context_builder.py 的 fetch_global_recent() 查 conversations 表时没有 `.eq("model_channel", ...)`。

**修复：** 给 fetch_global_recent 加 channel 参数，查询时加过滤。

### 6.3 OpenRouter model_channel 存储 Bug

**问题：** 通过 OpenRouter 的 Claude 对话被存为 `model_channel='deepseek'`。

**修复位置：** channels.py 的通道检测逻辑。当模型名为 `anthropic/claude-opus-4.6` 时，`get_channel_from_model()` 应该返回 `claude` 而不是 `deepseek`。检查逻辑是否正确匹配了 `anthropic/` 前缀。

### 6.4 记忆去重（排查报告 #6）

在 save_memory 工具和 micro_summary 写入之前，做简单的内容相似度检查：
- 方案 A：生成新记忆的 embedding，与现有记忆做向量搜索，如果相似度 > 0.95 则视为重复，不写入
- 方案 B：简单的文本前缀匹配（前50字一样就认为重复）
- **建议用方案 A**，更准确

---

## 七、实施顺序建议

```
第一步：Bug 修复（6.1 + 6.2 + 6.3）
  └─ 改动小，风险低，先让 channel 隔离正确工作

第二步：ai_journal 层
  ├─ micro_summary 禁止写 core_base
  ├─ 前端 MemoryPanel 加过滤选项
  └─ context_builder 排除 ai_journal

第三步：工具调用核心流程
  ├─ 后端工具定义 + 调用循环
  ├─ search_memory 实现
  ├─ save_memory 实现
  ├─ 新 SSE 事件（tool_start / tool_result）
  └─ 系统提示词补充

第四步：前端适配
  ├─ SSE 处理新事件
  ├─ 工具调用视觉提示 UI
  └─ 设置面板功能开关

第五步：去重机制（6.4）

第六步：测试验证
  ├─ 工具调用开启 → Claude 能搜能记
  ├─ 工具调用关闭 → 回到原来的流程
  ├─ ai_journal 记忆在 MemoryPanel 中可见
  └─ channel 隔离正确
```

---

## 八、注意事项

- **Code 要先读完整文件再改** — 不要基于片段做修改
- **OpenRouter 工具调用格式** — 用的是 OpenAI 兼容格式（function calling），不是 Claude 原生 tool_use 格式
- **DZZI 适配暂不做** — 等 OpenRouter 跑通后再补。DZZI 用的是 Claude 原生 API 格式，工具调用协议不同
- **embedding 截断** — 中文内容截断到 ~400 字符，不是 2000 字符
- **OpenRouter 的 thinking 标签问题** — 开了 tools 之后 thinking 行为可能变化，需要测试观察
- **工具调用 + 流式输出** — OpenRouter 在 streaming 模式下返回 tool_calls 的格式需要 Code 实际测试确认，可能和非流式不完全一样
