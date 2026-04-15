# CLAUDE.md — Reverie 前端

## 项目概述

Reverie 是 Dream 的 AI 伴侣前端，React + TypeScript + Vite 构建，部署在 `kdreamling.work/chat/`。

后端 Gateway 在阿里云服务器（memory-system 仓库），API 通过 vite proxy 转发到 `https://kdreamling.work`。

## 技术栈

- React 19 + TypeScript
- Vite（base path `/chat/`）
- Zustand 状态管理
- React Router（BrowserRouter，basename `/chat`）
- CodeMirror 6（代码高亮）
- D3（知识图谱可视化）
- PDF.js + mammoth（文档解析）
- Press Start 2P 字体（桌宠像素风）

## 目录结构

```
src/
  App.tsx          — 路由定义（14条路由）
  theme.ts         — 全局色彩系统（茶色调）
  pages/           — 页面组件（13个）
    ChatPage.tsx   — 主聊天页（最大文件）
    DiaryPage.tsx  — 日记页
    DashboardPage  — 日历/仪表盘
    AdminPage      — 管理面板
    StudyPage      — 学习模块
    ...
  components/      — 可复用组件
    pet/           — 桌宠系统（FloatingPet, PetActionPanel, petScripts）
    artifact/      — Artifact 展示
    reading/       — 阅读模式组件
    MemoryPanel    — 记忆面板
    ContextDebugPanel — 调试面板
    ...
  stores/          — Zustand stores（7个）
    chatStore.ts   — 聊天/消息/session 状态
    authStore.ts   — 认证状态
    ...
  api/             — API 调用（16个模块，按功能分）
    client.ts      — axios 实例 + 拦截器
    chat.ts        — 聊天 API（SSE streaming）
    ...
  utils/           — 工具函数
public/
  sprites/         — 桌宠 GIF 素材（clawd-* 系列）
  sw.js            — Service Worker（推送通知）
```

## 开发约定

- API 路径不带 `/api` 前缀，后端路由直接 `/pet/stats`、`/sessions` 等
- 桌宠相关文字全英文（Press Start 2P 不支持中文）
- UI 风格：空气感、线条感，不用实心按钮
- 部署：`npx vite build` → `scp -r dist/* aliyun:/www/wwwroot/kdreamling.work/chat/`

## 注意事项

- `chatStore.ts` 是核心状态，改动需谨慎
- `ChatPage.tsx` 较大（1400+ 行），后续计划拆分
- 桌宠系统在 `components/pet/`，台词在 `petScripts.ts`（Dream 可以直接编辑）
