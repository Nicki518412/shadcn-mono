---
name: add-page
description: Use when adding a new page or menu to this RBAC admin (new management page, new menu entry, or a new operation button), or when an existing menu shows 404 / a button is missing because the component key, permission code, or seed entry was not registered.
---

# add-page：新增页面全流程

本仓库页面 = 菜单树节点（DB）+ 约定式页面组件（`src/features/<component>/page.tsx`）+ 权限码（后端裁决 + 前端按钮门控）+ OpenAPI 契约（zod 三合一）。四个环节缺一不可。

## 步骤清单

1. **菜单表加 MENU 行**（二选一）：
   - **改种子**：`packages/db/src/seed.ts` 菜单树加节点，然后 `pnpm --filter @repo/db seed`（幂等：有 permission 按 permission upsert，无 permission 按 name+parentId+path 匹配，已存在则复用不更新）。适合随版本入库、团队共享。
   - **在线创建**：登录后用菜单管理页创建（运行时配置，不入种子）。注意种子重跑不会删除在线创建的节点（upsert 只增不改）。
2. **创建页面组件**：`src/features/<component>/page.tsx`。component key 约定：菜单 `component` 字段如 `system/user` → 文件 `features/system/user/page.tsx`。路由由 `src/router/generateRoutes.tsx`（import.meta.glob）自动注册，**无需改路由文件**；新增后重新 dev/build 生效。
3. **需要的权限码**：种子菜单加 BUTTON 行（如 `system:user:create`，规范 `模块:资源:操作`）；后端路由挂中间件 `requirePermission("...")`（`apps/api/src/routes/*.ts` 的 createRoute middleware 数组）。
4. **前端按钮门控**：操作按钮用 `<Permission code="...">` 包裹（或 `usePermissionCodes()` hook），无权限时渲染 fallback（默认不渲染）。
5. **后端接口响应补 OpenAPI**：`apps/api/src/lib/schemas.ts` 写具名 zod schema，响应经 `okBody(schema)` 包装（zod 同时驱动请求校验、OpenAPI 文档、前端类型三处）。
6. **文档同步**：涉及表结构变更时同步 `docs/database/schema.sql`（与 schema.prisma 双源约定）；纯接口/页面变更不需要。
7. **测试 + 提交**：补对应测试（api 集成 or web RTL），`pnpm turbo test` 全绿后按 conventional commits 提交。pre-commit 自动重生成 openapi.json + schema.d.ts——若 typecheck 报错提示 schema.d.ts 缺类型，说明生成产物陈旧，先手动跑 `pnpm --filter @repo/api generate:openapi && pnpm --filter @repo/api generate:types`。

## 易错点

- component key 必须与菜单 `component` 字段完全一致（含 `/` 分隔符），否则动态路由映射不到 → 点击 404。
- 新 BUTTON 权限码必须三处联动（种子/后端中间件/前端 `<Permission>`）；只加菜单行不挂码 = 前端按钮不可见、后端接口裸奔。
- 改已有菜单的 name/path（尤其无 permission 的 DIR 节点）会静默新建节点、旧节点残留——删除节点走菜单管理页（级联删子树）。
- 若种子是唯一数据来源，先重跑 seed 再回归，避免手改 dev.db。
