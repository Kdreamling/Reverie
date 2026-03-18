# Reverie 开发进度

> 最后更新：2026-03-19

---

## 已完成

### Phase 0 — 后端基础改造
- 数据库表改造（sessions, memory_summaries, conversations, memories）
- `context_builder.py` 独立模块，2500 token 预算
- JWT 鉴权 + Session CRUD API
- 多通道配置（deepseek / dzzi / dzzi-peruse / openrouter / antigravity）+ ThinkingAdapter
- 实时微摘要（`memory_cycle.py`）
- 安全加固（RLS, disabled FastAPI docs）+ 备份定时任务

### Phase 1 — 前端基础
- SSE 流式对话 + Markdown + 代码高亮
- ThinkingBlock 可折叠
- 会话管理（创建/删除/重命名/自动命名）+ 场景切换
- 模型切换（DeepSeek Chat / Reasoner / Claude DZZI / Claude OpenRouter）
- 登录页（克莱因蓝星空）
- AuthGuard 路由守卫

### Phase 2（部分）— 功能增强
- ✅ 记忆面板 UI（`MemoryPanel.tsx`，三层过滤 + 增删改查）
- ❌ 文件上传
- ❌ 对话导出
- ❌ 完整备份导出

### Phase 4（提前完成）— 手机端全面响应式
- 侧边栏抽屉（hamburger + 右滑开 / 左滑关 / 遮罩点击关）
- iOS 键盘适配（`visualViewport` API + `keyboardOffset`）
- 所有面板 iOS safe-area 适配（顶底 padding）
- `height: 100dvh`（Safari 地址栏兼容）
- PWA manifest + Apple meta tags
- 气泡输入框（未聚焦胶囊 ↔ 聚焦展开，textarea 自动增高）
- 消息内联操作（Copy + Delete 图标，替代长按弹层）
- 30s SSE 超时 + 发送失败捕获 → 红色提示 + 重试按钮
- 消息删除 API（`DELETE /sessions/{id}/messages/{conv_id}`）
- `body` 背景 `#fafbfd`（iOS safe-area 横条颜色修复）

### Phase 5 — 记忆系统增强

#### 基础修复
- `model_channel` / `scene_type` 写库修复
- FEATURE_FLAGS 统一（`config.py` 单一来源，6 个开关）
- OpenRouter thinking XML 格式修复（`adapters.py` 新增 `_adapt_openai_xml()`）
- 记忆噪点治理：微摘要标准收紧，`core_living` 14 天过滤 + 毕业机制

#### 可视化工具
- Context Debug 面板（`GET /api/debug/context`）
- Features 功能开关面板（6 个开关运行时热切换）

#### AI 主动记忆工具（memory_tool_enabled）
- `search_memory / save_memory / update_memory / delete_memory` 工具
- `list_memories / batch_delete_memories` 工具（默认关闭，需开启 list_tool_enabled）
- 流式工具调用（AI 回复中途实时调用，最多 3 轮循环）
- `MemoryRefBlock` + `MemoryOpsBlock`（流式实时 + 刷新后持久化）

#### 数据持久化
- embedding 生成（`store_conversation_embedding`，SiliconFlow BAAI/bge-large-zh-v1.5 1024维）
- `memory_ops` JSONB 持久化 + 历史消息加载还原
- `thinking_time` / `input_tokens` / `output_tokens` 持久化
- `<thinking>` 标签清理

### Phase 6 — 记忆系统深度改造（2026-03-16~17）

#### 中期记忆层（维度摘要系统）
- 对话驱动触发：>=10 轮 或 >=3轮+24h
- 四维度摘要：emotion / event / preference / knowledge
- 即时合并 + 每日凌晨 1 点兜底 cron
- context_builder 优先级 4 激活

#### memories 表 Embedding + 语义检索
- `embedding vector(1024)` + ivfflat 索引
- `search_memories_v2` RPC
- 所有写入路径异步生成 embedding

#### 混合检索升级（2026-03-17）
- 语义检索从纯向量升级为 **hybrid_search 管线**
  - 同义词扩展（synonym_service）
  - 关键词搜索 + 向量搜索并行
  - Rerank 二次打分（硅基流动 BAAI/bge-reranker-v2-m3，阈值 0.3）
- 排除逻辑修正：从 `exclude_session_id`（整个 session）改为 `exclude_conversation_ids`（仅窗口内对话），消除老对话盲区
- 滑动窗口修正：降序取最近 5 轮 + reverse（修复之前升序取最早 5 轮的 bug）

#### 长对话记忆混乱修复（2026-03-17）
- 历史窗口从 10 轮缩减到 5 轮，减少截断造成的残缺历史
- 执行顺序调整：先拉历史 → 收集窗口 IDs → 再构建上下文

#### 上下文注入可视化面板（2026-03-17）
- 后端 `build_context()` 返回 `(messages, debug_info)` 元组
- SSE done 事件附带 `debug_info`（记忆/检索/历史/摘要/token）
- 前端 `ContextDebugPanel.tsx`：两层结构（pill 标签 + 详情卡片 + token 进度条）
- `ChatMessage` 新增 `debugInfo` 字段，Brain 按钮展开面板
- 手机端适配（32px 最小高度、触控反馈、overscroll-contain）

#### 记忆毕业机制 + importance 分级
- 14 天内 limit 3 + 超 14 天且 importance >= 0.7 limit 2
- 按 memory_type 自动分级

### Phase 7 — Bug 修复 + AI 工具调用重构（2026-03-19）

#### Bug 修复
- adapters.py: `openai_xml` thinking_format 未被识别，thinking 内容泄露到文字 → 加入 dispatch
- context_builder.py: docstring 全角标点在服务器 locale 下触发 SyntaxError → 替换为半角
- 维度摘要游标卡死：`period_end` 只存日期导致永远重复处理同一批 → 改用 `min(created_at, period_end)` 双游标
- 维度摘要批量追赶：积压 300+ 轮时每次只处理 30 轮 → 改为循环处理（最多 8 批 × 30 轮）

#### AI 工具调用（Tool Calling）
- OpenRouter tool calling 验证通过（非流式 + 流式 + 完整循环）
- `_reverie_stream` 工具调用循环：检测 `finish_reason: tool_calls` → 执行 → 第二轮无 tools 强制文字回复
- 精简工具集：`search_memory`（hybrid_search）+ `save_memory`（ai_journal 层，source="ai_tool"）
- 工具调用轮次关闭 thinking，最终轮恢复
- 功能开关：`memory_tool_enabled` flag，默认关闭
- 前端复用 `tool_searching` / `tool_result` SSE 事件

#### 通道管理重构
- `channels.py` 独立模块：通道配置 + `resolve_channel()` + `MODEL_ALIASES` + `get_model_list()`
- OpenRouter 通道：`thinking_format: "openai_xml"`，adapter 统一处理 `<thinking>` XML 标签和 `reasoning_content` 字段

---

## 待处理

### 低优先级 / 暂搁置
- 停止生成按钮
- 代码块语言标签 + 一键复制

### 未开始
- Phase 2：文件上传、对话导出
- Phase 3：Artifacts 系统（代码编辑器、HTML/SVG/Mermaid 预览、版本管理）
- 语音输入/朗读
- 历史对话搜索
- Web Push 通知

---

## 注意事项

- Features 面板的开关修改**进程内立即生效**，服务重启后恢复 `config.py` 默认值
- `search_enabled` 默认 `True`，走 hybrid_search 管线
- `list_tool_enabled` 默认 `False`
- Nginx 路由：`/api/` → 8001（需 JWT），`/v1/` → 8001（Kelivo 兼容，无 Basic Auth）
- **Git Tags**：每个里程碑打 tag，最新：`v-before-debug-panel`、`v-before-hybrid-search`
