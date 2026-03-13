# Reverie 项目进度记录

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
- 前端：ChatPage 搜索结果徽章（"参考了 N 条记忆" 附在 assistant 消息下方）
- 前端：FeaturesPanel 新增 memory_tool_enabled 开关
- 默认关闭，通过 Features 面板按需开启

### Bug Fix — FEATURE_FLAGS 双份技术债修复
- 问题：`main.py` 自己维护一份 FEATURE_FLAGS，`config.py` 另一份，admin 端点修改的和 `context_builder.py` 读的不是同一个对象
- 修复：`main.py` 改为 `from config import FEATURE_FLAGS`，删除本地定义，统一为单一数据源
- 同步修复：`_reverie_store` 加入 `memory_enabled` 早返回守卫

---

## 未完成 / 待处理

### 语义检索优化（`search_enabled`）
- 当前默认关闭，噪点过多
- 待条件：`conversations` 表数据量积累后，用 `GET /debug/context` 验证注入质量
- 可通过 Features 面板临时开启测试，满意后再改 `config.py` 默认值

### 前端输入框延迟问题
- 根因已定位：`ChatPage.tsx` 中 `currentText` / `currentThinking` 在 useEffect 依赖数组里导致不必要的重渲染
- 已搁置，待记忆系统稳定后处理

### 项目文档更新
- `交给LTalk 架构设计文档 · 最终定稿.md` 尚未同步最新阶段的变更
- `Reverie_项目指南_v1.md`（若存在）同上

### 语义检索重开前置工作（可选）
- 验证 `search_conversations_v2` RPC 的 similarity 分布是否合理
- 考虑将阈值从 0.75 调整（需要实测数据支撑）

---

## 注意事项

- Features 面板的开关修改**进程内立即生效**，但服务重启后恢复 `config.py` 的默认值
- Nginx 当前路由：`/api/` → 8001（宝塔面板已关闭日记 API 节点，避免 `/api/admin/` 被截走）
- 部署流程：本地改动 → `git push origin reverie` → 服务器 `git pull` → 重启 gateway
