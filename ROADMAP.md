# Reverie 项目进度记录

> **最后更新**：2026-03-14

---

## 已完成

### Phase 1 — Channel 写库修复
- `model_channel` 和 `scene_type` 现在正确写入 `conversations` 表
- 修复了之前两个字段均为空的问题

### Phase 2 — 记忆噪点治理
- `search_enabled` 默认关闭（语义检索噪点过多，待数据量积累后重开）
- 微摘要判断标准收紧：只记录 Dream 明确陈述的事实，过滤普通闲聊
- `core_living` 层记忆增加 14 天活跃过滤（超期由 merged_summary 吸收）
- 每日自动记忆上限：3 条（防刷爆）

### Phase 3 — Context Debug 面板
- 后端：`GET /api/debug/context?session_id=&model=`
  - 返回实际注入给模型的完整 system prompt、token 估算、所用通道
- 前端：`DebugPanel.tsx` + SettingsPanel 入口
  - 查看当前会话下一次请求会注入哪些记忆

### Phase 4 — Features 功能开关面板
- 后端：`GET/PATCH /api/admin/settings`
- 前端：`FeaturesPanel.tsx` + SettingsPanel 入口
- 4 个开关：记忆注入、对话存储、自动记忆、语义检索

### Phase 5 — AI 主动搜索记忆工具（memory_tool_enabled）
- 后端：`search_memory` tool definition（OpenAI function calling 格式，三个 channel 通用）
- 后端：pre-streaming tool phase — 非流式探针调用，工具执行完毕后再开 SSE 流
- 后端：`_execute_memory_search` — 搜索 `memories` 表 + hybrid_search 对话检索，结果注入 messages
- 前端：chatStore 新增 `isSearchingMemory` / `searchingQuery` 状态 + SSE 事件分发
- 前端：ChatPage 搜索进行中动效（蓝点 + "正在搜索记忆「query」…"）
- 前端：`MemoryRefBlock` 折叠块 — 显示实际检索到的内容（query + 条数 + 原文），附在 assistant 消息下方
- 前端：FeaturesPanel 新增 memory_tool_enabled 开关
- 后端：`tool_result` SSE 事件新增 `content` 字段，携带实际检索文本
- 默认关闭，通过 Features 面板按需开启
- Git tag：`v-phase5-memory-tool`

### Phase 6 — 手机端全面响应式（Steps 1–6）
- **Step 1**：侧边栏抽屉
  - 移动端侧栏改为 `position: fixed` 滑入抽屉
  - 汉堡按钮（仅移动端显示）+ 半透明遮罩
  - 顶部 safe-area-inset-top padding 防止内容藏进刘海
- **Step 2**：聊天区响应式布局
  - 消息区 max-width 居中，Tailwind `md:` 断点 ≥768px 切换列数
- **Step 3**：iOS 键盘适配
  - `visualViewport` API 监听键盘弹出 → `keyboardOffset` 推高输入框
  - `height: 100dvh` 替换 `h-screen` 解决 Safari 底栏问题
  - `overscroll-behavior: none` 防止整页回弹
- **Step 4**：Settings / Memory / Features / Debug 面板全屏适配
  - 移动端用 `fixed inset-0`，桌面端用 `absolute`
  - 所有子面板顶部 `paddingTop: calc(16px + env(safe-area-inset-top))`
- **Step 5**：触摸手势
  - 右滑（起点 ≤60px）开侧边栏，左滑关闭
  - Settings 内左滑：子页面 → 返回菜单 → 关闭 Settings
  - 侧边栏会话长按弹出菜单（重命名 / 删除）
  - 使用 `window.addEventListener` 全局监听，穿透 fixed 遮罩层
- **Step 6**：PWA
  - `public/manifest.json`：name Reverie, theme_color #002FA7, display standalone
  - `index.html`：Apple meta tags（apple-mobile-web-app-capable, status-bar-style 等）
  - viewport 加 `viewport-fit=cover, maximum-scale=1`

### Phase 7 — 手机端体验优化·第二轮迭代（改动 1–4）
- **改动 1**：统一 Claude App 风格气泡输入框
  - 移动/桌面共用同一套 UI：白色圆角卡片（`rounded-full` ↔ `rounded-2xl` 动态切换）
  - 未聚焦紧凑胶囊，聚焦后展开，textarea 随内容自动增高（max 150px）
  - 发送按钮：无文字时灰色，有文字时克莱因蓝
- **改动 2**：重命名会话光标修复
  - 重命名 input 启动时 value 为空（placeholder 显示原标题），避免 iOS 自动全选
- **改动 3**：消息操作按钮（内联图标）
  - 去掉长按弹出浮层菜单，改为每条消息内容下方固定显示 Copy + Trash2 图标
  - 复制成功：图标短暂切换为 Check（1.5s）
  - 删除：`window.confirm` 确认 → 前端移除 + 后端 DELETE API
  - 后端：`DELETE /api/sessions/{session_id}/messages/{conversation_id}` 新路由
- **改动 4**：AI 无响应错误处理
  - SSE 流 30s 超时：`setTimeout` 取消 reader，显示"连接超时，请重试"
  - 发送失败 catch：显示"发送失败，请重试"
  - 错误区域：红色提示卡 + 重试按钮 + 忽略按钮
  - `retryLast()`：移除最后一条用户消息并重新发送

### Bug Fix 轮次 · v3.4
- footer 背景去掉独立颜色（改由根容器 `#fafbfd` 透出）
- 修复 textarea 双 useEffect 冲突（第二个一直覆盖折叠逻辑）
- 修复折叠条件：`!isFocused` 而非 `!input && !isFocused`（失焦即折叠）
- textarea 失焦时 `scrollTop = 0`，确保文字从开头显示
- `handleDeleteConv` 加 try/catch，API 失败时 toast 提示
- Git tag：`v3.4-mobile-bugfix`

### Bug Fix 轮次 · v3.5
- 替换长按消息弹层 → 内联图标按钮（Copy/Check + Trash2）
- 侧边栏底部加 `paddingBottom: env(safe-area-inset-bottom)` + 显式 `background: #0a1a3a`
- 侧边栏 `<aside>` 使用 `height: 100dvh` 替换 `h-full`（避免 fixed 元素的 `100%` 解析为 `100vh`）
- 加 `closeSidebar` useEffect 监听 sidebarOpen，关闭时清空 editingId
- `sessions.py` DELETE 端点去掉 `if not result.data:` 检查（Supabase 不一定返回被删行）
- Git tag：`v3.5-mobile-bugfix-2`

### Bug Fix 轮次 · v3.6
- `index.css` body 背景从 `#f2f4fa` 改为 `#fafbfd`（iOS safe-area 横条颜色来自 body）
- `index.css` 新增 `#root` 同样设 `#fafbfd !important`
- 侧边栏 `<aside>` 明确 `height: 100dvh`（彻底封闭底部缝隙）
- 重命名 input 使用 `autoFocus` + 空 value + placeholder 显示原标题，彻底避免 iOS 全选
- 所有 `setSidebarOpen(false)` 调用点直接紧跟 `setEditingId(null)` + `setEditingTitle('')`，不再依赖 useEffect 间接触发
- Git tag：`v3.6-mobile-bugfix-3`

### Bug Fix — OpenRouter Claude thinking 格式修复
- 根因：OpenRouter 将 thinking 以 `<thinking>...</thinking>` XML 标签混入 `content` 字段，而非 `reasoning_content` 字段
- 修复：`channels.py` 新增 `thinking_format: "openai_xml"`；`adapters.py` 新增 `_adapt_openai_xml()` + 流式 XML 解析器
- Git tag：`v-openrouter-thinking-fix`

### Bug Fix — FEATURE_FLAGS 双份技术债修复
- `main.py` 改为 `from config import FEATURE_FLAGS`，删除本地定义，统一单一数据源
- 同步修复：`_reverie_store` 加入 `memory_enabled` 早返回守卫

### Bug Fix 轮次 · v2.7–v2.8（Mobile Bugfix Round 4）
- html/body/root 全部 `position: fixed; overflow: hidden; height: 100%`，锁死 iOS 视口防止整页滑动
- body `touch-action: none` 防止 iOS PWA 触摸输入时界面挪动
- 侧边栏会话标题添加 `-webkit-user-select: none` 防止 iOS 长按触发原生文字选择
- 侧边栏 / 根容器高度统一改为 `height: 100%`（继承 fixed html/body）
- 输入框 footer 改为 `position: absolute; bottom: 0`，背景透明，Claude 风格浮动气泡
- footer 上方 32px 线性渐变淡出（transparent → #fafbfd），消除硬边界
- Bug 3 修复：`closingSidebarRef` 防止 onBlur 竞态，仅在打开侧边栏时重置
- Git tags：`v2.7-mobile-bugfix-4.2`, `v2.8-mobile-bugfix-4.3`

---

## 未完成 / 待处理

### iOS 重命名会话仍有全选问题
- 已尝试 3 轮修复（autoFocus + 空 value + placeholder 等），iOS 行为不一致
- 暂搁置，后续可考虑换方案：自定义 modal 弹窗替代 inline input，或 contentEditable div

### 语义检索优化（`search_enabled`）
- 当前默认关闭，噪点过多
- 待条件：`conversations` 表数据量积累后，用 `GET /debug/context` 验证注入质量
- 可通过 Features 面板临时开启测试

### 前端输入框延迟问题
- 根因已定位：`ChatPage.tsx` 中 `currentText` / `currentThinking` 在 useEffect 依赖数组里导致不必要的重渲染
- 已搁置，待记忆系统稳定后处理

### 项目文档同步
- `交给LTalk 架构设计文档 · 最终定稿.md` 的开发顺序已部分更新（Phase 4 手机端响应式 ✅）

### 语义检索重开前置工作（可选）
- 验证 `search_conversations_v2` RPC 的 similarity 分布是否合理
- 考虑将阈值从 0.75 调整（需要实测数据支撑）

### Phase 2（架构文档中的 Phase 2）— 文件上传、对话导出
- 尚未开始

### Phase 3（架构文档中的 Phase 3）— Artifacts
- 尚未开始

---

## 已知小问题（低优先级，不影响功能）

- **重复 `done` 事件**：`main.py` 有硬编码兜底 `yield done`，adapter 在循环里已经 yield 过含 `usage` 的 `done`，前端遇到第一个就停止，无害但不干净
- **ChatPage.tsx 文件过大**：约 900 行，侧栏 / 消息 / 输入 / 欢迎页全在一个文件里

---

## 注意事项

- Features 面板的开关修改**进程内立即生效**，但服务重启后恢复 `config.py` 的默认值
- Nginx 当前路由：`/api/` → 8001（宝塔面板已关闭日记 API 节点，避免 `/api/admin/` 被截走）
- **前端部署**：`npm run build` → `scp -r dist/* root@kdreamling.work:/www/wwwroot/kdreamling.work/chat/`
- **后端部署**：本地改动 → `git push origin reverie` → 服务器 `git pull origin reverie` → 重启 gateway
- **重启命令**：`kill $(ps aux | grep "python3 main.py" | grep -v grep | awk '{print $2}'); cd /home/dream/memory-system/gateway && nohup python3 main.py > gateway.log 2>&1 &`
- **iOS 体验关键点**：safe-area-inset-top/bottom 需要在 header/footer/sidebar 的顶底 padding 中显式处理；body 背景色必须与内容区一致否则 home indicator 条纹会漏色
- **Git Tags**：每个里程碑都有 tag（`v3.x-*`），可用 `git checkout <tag>` 回退任意版本
