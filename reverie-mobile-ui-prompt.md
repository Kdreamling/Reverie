# Reverie 手机端 UI 美化 — Claude Code 执行指令

## 背景
Reverie 是一个自托管 AI 聊天前端，技术栈为 React 18 + TypeScript + Vite + Tailwind CSS + Zustand。
本次任务仅针对**手机端（移动端）**聊天主界面进行视觉美化，**桌面端保持不变**。
所有改动应通过 CSS 媒体查询或响应式断点来限制作用范围（建议断点：`max-width: 768px`）。

主要改动文件预计是：
- `src/pages/ChatPage.tsx`（聊天主界面）
- `src/index.css`（全局样式 / Tailwind 自定义）
- 可能涉及 `src/stores/chatStore.ts`（如果 token 数据需要从 SSE done 事件中提取）

## 设计规范参考
- 品牌主色：`#002FA7`（克莱因蓝）
- 聊天区背景：保持浅色系，但改为连续渐变（见下方第1点）
- 字体：保持现有字体配置不变
- 设计理念："登录是夜空，聊天是天亮" — 聊天区应明亮、温暖、有呼吸感

---

## 改动清单（共7项）

### 1. 整体一体化 — 消除板块生硬感（仅移动端）

**问题**：当前 header、消息区、输入框像三块硬拼的积木，分割线太生硬。

**改动**：
- 聊天区整体背景改为**连续渐变**，替代原来的纯色 `#fafbfd`：
  ```css
  background: linear-gradient(180deg, #f5f7fc 0%, #f0f2f9 35%, #edf0f8 65%, #f2f4fa 100%);
  ```
- Header 底部和输入框顶部的分割线，改为**渐隐效果**（两端透明，中间极淡），替代原来的实线 border：
  ```css
  /* 替代 border-bottom: 1px solid #dde2ed 这种硬线 */
  background: linear-gradient(90deg, transparent 0%, rgba(0,20,60,0.06) 30%, rgba(0,20,60,0.06) 70%, transparent 100%);
  height: 1px;
  ```
- 输入框容器加**毛玻璃效果**：
  ```css
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(0, 20, 60, 0.05);
  box-shadow: 0 1px 8px rgba(0,20,60,0.03), inset 0 1px 0 rgba(255,255,255,0.5);
  border-radius: 22px;
  ```
- （可选增强）在聊天区背景上加一层极微弱的 noise 纹理（opacity 约 0.012-0.015），增加纸张质感，避免纯平数字感。

### 2. 时间格式 — 加月/日显示

**当前**：时间只显示 `7:44 AM`
**改为**：`03/15 7:44 AM` 格式（MM/DD h:mm AM/PM）

改动位置：消息渲染时的时间格式化逻辑。如果当前是从后端 `created_at` 字段解析的，在格式化时加入月和日。
参考格式化代码：
```typescript
const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${month}/${day} ${time}`;
};
```

### 3. Token 用量显示

**需求**：每条 AI 回复底部显示 token 用量。

**数据来源**：后端 SSE 流中的 `done` 事件已经包含 `usage` 字段：
```json
{ "type": "done", "usage": { "input_tokens": 3254, "output_tokens": 187 } }
```
请先确认 `chatStore.ts` 中 SSE 解析 `done` 事件时是否已经保存了 `usage` 数据。如果没有，需要：
1. 在 `ChatMessage` 类型中添加 `tokens?: { input: number; output: number }` 字段
2. 在 SSE 解析 `done` 事件时，将 `usage` 数据写入当前消息

**显示样式**：
- 位置：AI 消息气泡下方，与时间在同一行
- 格式：`03/15 9:42 PM · ⏱ 3,254 in · 187 out`
- 样式：与时间相同的淡灰色小字（约 10.5-11px），所有元素**垂直居中对齐在同一条基线上**
- 数字使用千分位分隔符：`toLocaleString()`
- 仅 AI 消息显示 token，用户消息不显示

**对齐注意**：时间文字、分隔点 `·`、小图标、token 数字，这些元素要用 `display: flex; align-items: center; gap` 确保严格在一条水平线上，不要出现视觉偏移。

### 4. Thinking / 搜索记忆 / 记忆操作 — 样式统一

**问题**：当前三种块风格各异（Thinking 太淡、搜索记忆蓝色太艳、记忆操作绿色太花哨），视觉上很杂乱。

**改动方向**：统一为**同一套基础样式**，仅通过小图标或文字标签区分类型，不再用大面积不同颜色。

**统一样式规范**：
```css
/* 三种块共用的基础样式 */
.collapsible-block {
  margin: 6px 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.03);      /* 统一淡灰底，比之前深一点 */
  border-left: 3px solid rgba(0, 0, 0, 0.08);  /* 统一淡灰左边框 */
  cursor: pointer;
  transition: background 0.2s ease;
}
.collapsible-block:hover {
  background: rgba(0, 0, 0, 0.045);
}

/* 标题文字 */
.collapsible-block .block-title {
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;   /* 中灰色，比之前的 #9ca3af 深，比蓝/绿色淡 */
}

/* 展开内容文字 */
.collapsible-block .block-content {
  font-size: 13px;
  color: #9ca3af;
  line-height: 1.55;
  margin-top: 6px;
}
```

**各类型的区分方式**（仅通过标题文字前的小标签/图标区分）：
- **Thinking**：标题显示 `▶ Thinking ···`（收起时）/ `▼ Thinking`（展开时），无额外标签
- **搜索记忆**：标题显示 `▶ 搜索记忆「xxx」· 找到 N 条`，文字前可加一个小 🔍 图标（可选）
- **记忆操作**：标题显示 `▶ 记忆操作 · N 条`
  - 展开后的操作项中，`删除` 标签保持红色小药丸（`background: rgba(239,68,68,0.1); color: #ef4444`），这是功能性色彩可以保留
  - `创建`/`修改` 标签用蓝色小药丸

**关键原则**：三种块的背景色、边框色、标题色完全一致，只靠文字内容区分。

### 5. 操作按钮 — 新增重发 + 同行左右分布

**当前**：每条消息下方有复制按钮（右下角）。

**改动**：
- 新增**重发按钮**（retry/regenerate 图标）
- 保留复制、删除按钮
- 布局改为**同一行左右分布**：

**AI 消息的底部行**：
```
左侧: 03/15 9:42 PM · ⏱ 3,254 in · 187 out
右侧: [复制] [删除] [重发]
```

**用户消息的底部行**：
```
左侧: [复制] [删除] [重发]
右侧: 03/15 9:43 PM
```

**按钮样式**：
- 图标大小约 14px，颜色 `rgba(0,0,0,0.2)`，hover 时 `rgba(0,0,0,0.45)`
- 按钮间距用 gap: 8px
- 整行用 `display: flex; justify-content: space-between; align-items: center`
- 重发按钮图标建议用 ↻ 循环箭头（类似你截图中 Claude App 的最后一个图标）

**重发功能逻辑**：
- 用户消息的重发：重新发送该条用户消息（删除该消息及其后的所有消息，然后重新发送）
- AI 消息的重发：重新生成该条 AI 回复（删除该 AI 回复，然后用上一条用户消息重新请求）
- 如果实现复杂度太高，可以先只做 UI 按钮，点击后 console.log 提示 "regenerate triggered"，后续再接逻辑

### 6. AI 消息气泡样式微调（可选优化）

当前 AI 消息气泡如果已经有白色背景，可以考虑加上毛玻璃效果增强一体感：
```css
background: rgba(255, 255, 255, 0.8);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
box-shadow: 0 1px 6px rgba(0, 20, 60, 0.05), 0 0 0 0.5px rgba(0, 20, 60, 0.04);
```

### 7. 响应式限制

**所有以上改动必须限制在移动端**，建议方式：
- 使用 Tailwind 的响应式类（`md:` 前缀表示 768px 以上）
- 或者在 CSS 中用 `@media (max-width: 768px) { ... }` 包裹所有新样式
- 桌面端（≥768px）保持当前的所有样式和行为不变

如果当前 ChatPage.tsx 没有做移动端/桌面端的样式区分，这次是一个好的时机来建立这个模式。可以考虑给聊天区容器加一个 class（如 `chat-container`），然后在 CSS 中用媒体查询来分别定义移动端和桌面端的样式。

---

## 执行顺序建议

1. **先读完整个 ChatPage.tsx 和 index.css**，了解当前结构
2. **先做第1项（一体化背景+渐隐线+毛玻璃）**，这是视觉改动最大的
3. **再做第4项（统一三种块的样式）**，这个改动范围可能跨多个组件
4. **然后做第2+3项（时间格式+Token显示）**，这两个关联性强
5. **再做第5项（操作按钮）**，这涉及新增按钮和布局重排
6. **最后做第7项（响应式限制）**，给所有改动加上媒体查询保护
7. 第6项是可选的，视效果而定

## 注意事项

- **不要动桌面端的样式**——所有改动限制在移动端
- **不要动后端代码**——这次是纯前端改动（除非 token 数据需要从 SSE 中提取，那只涉及 chatStore.ts 中 SSE 解析逻辑）
- **保持现有功能不变**——只是视觉美化，不改变任何功能逻辑
- **改完后请告诉我每个文件的改动摘要**，方便 Dream 确认
- 如果对某个改动项不确定实现方式，请暂停并询问，不要猜测

---

## 参考
- 整体氛围参考：https://sleep-well-creatives.com （深邃、有层次感、沉浸式）
- Thinking 块参考：Claude 官方 App 的淡灰可折叠样式
- Token 显示格式：`03/15 9:42 PM · ⏱ 3,254 in · 187 out`
- 操作按钮参考：Claude 官方 App 底部的 复制|分享|播放|点赞|反馈|重发 图标行
