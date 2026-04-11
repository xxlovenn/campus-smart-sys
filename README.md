# 校园综合智慧管理系统 / Campus Smart Sys

比赛交付物：前后端源码 + `docker-compose.yml` + `Dockerfile(s)` + `.env.example` + 部署文档。

## 功能概览

- **学生时间与任务管理**：个人计划、时间轴视图、课表（含模拟学校 API 合并）、即将到期汇总。
- **组织 OA 与任务流转**：跨组织关联、状态更新、团委全局任务看板（JSON 概览）。
- **学生个人档案中心**：三语基础信息、GitHub、荣誉、能力标签、团委审核（通过/驳回）。
- **三语界面**：中文 / English / Русский（`next-intl` + 导航切换；业务数据字段三语存储）。

## 前置条件

- Docker / Docker Compose v2
- 可选：Node.js 20+（本地开发）

## 一键部署（评审标准流程）

在项目根目录：

```bash
git clone <你的 GitHub 仓库地址>
cd Campus_Smart_Sys
cp .env.example .env
# 建议编辑 .env：修改 POSTGRES_PASSWORD 与 JWT_SECRET
docker compose up -d --build
```

访问：

- 前端：<http://localhost:3000>（自动进入默认语言路由，例如 `/zh`）
- 后端 API（可直连调试）：<http://localhost:3001/api>

> 前端统一使用相对路径 `/api`，并通过 Next.js rewrites 转发到 `backend:3001/api`。
> 比赛部署时无需配置或修改 `NEXT_PUBLIC_API_URL`，也不需要重新构建前端来切换后端地址。

## Backend 启动与初始化（推荐）

- 正常容器启动（生产推荐，不重复 seed）：

```bash
docker compose up -d --build
```

> backend 容器启动流程为：`prisma migrate deploy` + `node dist/main.js`（通过 `npm run start:container`），不会在每次启动时自动执行 seed。

- 首次初始化演示数据（仅需要时执行一次）：

```bash
docker compose exec backend npm run db:init
```

- 仅重置演示数据（不会重启服务）：

```bash
docker compose exec backend npm run db:reseed
```

## 默认演示账号（种子数据）

密码均为 **`demo123456`**：

| 角色     | 邮箱                 | 说明        |
|----------|----------------------|-------------|
| 学生     | `student@campus.demo` | 课表/计划/任务/档案 |
| 社团负责人 | `org@campus.demo`     | 可创建组织任务     |
| 团委管理员 | `league@campus.demo`  | 组织管理、全局任务、档案审核 |

## 演示指引（答辩建议路径）

1. 使用学生账号登录 → **时间轴与课表**：查看课表合并与「同步模拟课表 API」。
2. **组织任务**：演示跨组织任务、状态流转；换团委账号查看 **/tasks** 底部全局 JSON 概览。
3. **个人档案**：编辑三语身份信息、添加荣誉/标签 → 换团委账号在 **团委后台** 审核通过/驳回。
4. 切换 **ZH / EN / RU** 导航语言，确认界面词条与数据三语字段展示。

## 目录结构

```text
项目根目录/
├── docker-compose.yml
├── .env.example
├── README.md
├── init-data/              # 可选：Postgres 初始化（扩展等）
├── backend/                # NestJS + Prisma + PostgreSQL
└── frontend/               # Next.js 14 (App Router) + next-intl
```

## 常见问题

- **端口占用**：修改 `docker-compose.yml` 中 `3000` / `3001` / `5432` 映射。
- **JWT / 数据库连接失败**：确认根目录 `.env` 与容器内 `DATABASE_URL` 一致；重新 `docker compose up -d --build`。
- **前后端通信配置**：前端固定请求 `/api`；如需变更容器内后端地址，只需改 `.env` 中 `BACKEND_INTERNAL_ORIGIN` 并重启前端容器。
- **Windows 防火墙**：优先访问前端 `localhost:3000`，前端会同源转发 `/api` 到后端；若直接调试后端端口，再放行 `3001`。

## 将代码推送到你的 GitHub（新建公开库）

1. 在 GitHub 上创建 **Public** 仓库（例如 `campus-smart-sys`）。
2. 本地在项目根目录执行：

```bash
git init
git add .
git commit -m "feat: initial campus smart system for competition"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

## 技术栈

- 后端：NestJS 10、Prisma、PostgreSQL、JWT
- 前端：Next.js 14、React 18、next-intl
- 部署：Docker Compose 编排 `postgres` + `backend` + `frontend`

## 许可

比赛作品代码仅供赛事评审与学习使用；引用赛事与 Cursor 社区支持说明请遵循组委会官方声明。
