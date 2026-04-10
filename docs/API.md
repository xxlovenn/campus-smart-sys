# API 速查（前缀 `/api`）

## 认证

- `POST /auth/login` — body: `{ "email": "", "password": "" }` → `{ accessToken, user }`

其它接口（除 login 外）在 Header 携带：`Authorization: Bearer <token>`。

## 用户

- `GET /users/me`

## 组织

- `GET /organizations` — 学生/社团：可见已加入；团委：全部
- `POST /organizations` — **团委**创建组织（三语名称与类型）

## 任务（OA）

- `GET /tasks` — 按角色过滤可见任务（含跨组织关联）
- `POST /tasks` — **社团负责人/团委**创建（学生不可建）
- `PATCH /tasks/:id/status` — 更新状态
- `GET /tasks/admin/overview` — **团委**全局统计与列表

## 个人计划 & 提醒

- `GET /plans` / `GET /plans/timeline`
- `POST /plans` — 创建计划（三语标题）
- `DELETE /plans/:id`

- `GET /reminders/upcoming` — 7 天内将到期的计划与任务

## 课表（模拟 API）

- `GET /schedule` — DB + mock 合并
- `POST /schedule/sync-mock` — 模拟从学校同步写入

## 档案中心

- `GET /profile/me` / `PATCH /profile/me`
- `POST /profile/awards` / `DELETE /profile/awards/:id`
- `POST /profile/tags` / `DELETE /profile/tags/:id`
- `GET /profile/admin/pending` — **团委**待审核列表
- `PATCH /profile/admin/:userId/review` — body: `{ "approve": true|false, "reason"?: "" }`

## 通知

- `GET /notifications`
- `PATCH /notifications/:id/read`
- `PATCH /notifications/read-all`
