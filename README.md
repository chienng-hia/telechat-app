# TeleChat

一个基于 TypeScript 全栈实现的简约现代风类 Telegram 实时聊天应用（零外部数据库依赖，开箱即用）。

## 技术栈
- **前端** (`apps/web`): React + Vite + TypeScript + Tailwind CSS + Socket.IO Client
- **后端** (`apps/server`): Node.js + Fastify + Socket.IO + SQLite (`better-sqlite3`) + JWT
- **共享类型** (`packages/shared`): TypeScript 前后端共享 DTO 与 WebSocket 事件契约

## 快速启动

```bash
npm install
npm run dev
```

启动后：
- 前端地址：`http://localhost:5173`
- 后端地址：`http://localhost:3001`
- 首次启动会自动在 `apps/server/data/telechat.db` 初始化 SQLite 表结构并写入 4 个演示账号（`alice` / `bob` / `charlie` / `diana`，默认密码 `password123`，登录页支持一键切换登录）。

## 构建与测试

```bash
# 全量构建 shared + server + web
npm run build

# 运行后端 REST API 与 Socket.IO 集成测试
npm test
```
