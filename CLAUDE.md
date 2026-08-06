# CLAUDE.md

shadcn-mono：RBAC 管理端 monorepo（Hono + zod-openapi 后端 / Vite + React + shadcn-ui 前端 / Prisma 数据库，SQLite·MySQL·PostgreSQL 三方言可移植）。本文件是智能体开发本仓库的指南；设计文档在 `docs/superpowers/specs/`，实施计划在 `docs/superpowers/plans/`，数据库文档在 `docs/database/`。

## 仓库结构与目录职责

| 目录 | 职责 |
|---|---|
| `apps/api` | Hono 后端。路由 `src/routes/*.ts`（auth / otp / me / users / roles / menus）；认证与权限中间件 `src/middleware/{auth,clerk-auth}.ts`；动态码发送入口 `src/lib/otp-sender.ts`（OtpSender 接口 + DevOtpSender）；OpenAPI 契约生成物 `apps/api/openapi.json` |
| `apps/web` | Vite + React 19 + react-router 7 + TanStack Query。页面为约定式 `src/features/<component>/page.tsx`；动态路由与守卫 `src/router/{generateRoutes,guards}.tsx`；登录抽象 `src/auth/`（JWT / Clerk 两个 Provider 实现，经 `src/auth/AuthProvider.tsx` 统一）；`src/components/ui/` 是 shadcn 组件（CLI 安装，勿手写）；`src/api/schema.d.ts` 是 openapi-typescript 生成物 |
| `packages/shared` | 权限纯函数 `computeVisibleMenus`（**权限计算的唯一位置**，见设计文档 §6） |
| `packages/db` | Prisma schema（运行时权威，全字段中文 docstring）+ 幂等种子 `src/seed.ts`（admin/Admin@123、菜单树、ADMIN/GUEST 角色） |
| `packages/config` | 共享 `tsconfig.base.json` 与 eslint 配置（被各包继承） |

## 常用命令（根目录执行）

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 同时起 web（5173）与 api（3001）；`/api` 由 Vite 代理到 3001 |
| `pnpm turbo test` | shared 单元 + api 集成（自动重建 SQLite 测试库）+ web RTL |
| `pnpm turbo build` / `pnpm turbo lint` | 全量构建 / 全量 lint |
| `pnpm --filter @repo/db seed` | 幂等种子；会重置 admin 口令与演示联系方式 |
| `pnpm --filter @repo/api generate:openapi && pnpm --filter @repo/api generate:types` | 重生成 `openapi.json` 与 `web/src/api/schema.d.ts`；改 api 源码后建议跑（pre-commit 会自动执行） |
| `pnpm --filter @repo/db db:migrate -- --name <name>` | Prisma migrate dev（切库见 `.claude/skills/switch-database`） |

## 规范要点

- **严格 TS**：`packages/config/tsconfig.base.json`（strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes、verbatimModuleSyntax、noUnusedLocals/Parameters、noFallthroughCasesInSwitch 等）。唯一放宽：web 包 `exactOptionalPropertyTypes: false`（shadcn 上游组件产物不兼容，原因见 `apps/web/tsconfig.json` 注释——勿扩大放宽面）。
- **shadcn 严格 CLI**：组件一律 `npx shadcn@latest add <component>` 安装，**禁止手写/复制粘贴组件源码**；升级/覆盖走 `--dry-run` → `--diff` 合并，并跳过 ignore 面 = `src/components/ui/` 全部 + `src/hooks/use-mobile.ts` + `src/api/schema.d.ts`（生成物与 CLI 无关）。新 UI 需求先 `npx shadcn@latest search` 官方/社区 registry。
- **权限码规范**：`模块:资源:操作`（如 `system:user:create`）。新增权限三处联动：种子菜单 BUTTON 行（或菜单管理页在线创建）+ 后端路由 `requirePermission(code)` 挂码 + 前端 `<Permission code="...">` 包裹。计算规则唯一在 `packages/shared`（纯严格交集，无超管例外）。
- **三方言约定**（设计文档 §11）：不用 Prisma enum（字符串 + zod 校验）；可空唯一字段（邮箱/手机/username 冲突统一转 409）；树操作全量取回 + 内存建树（不用递归 CTE）；不用 JSONB/方言专属函数；时间统一 UTC。
- **schema 双源同步**：`packages/db/prisma/schema.prisma` 字段/注释变更必须同步 `docs/database/schema.sql`（MySQL DDL 文档版，运行时权威仍是 schema.prisma），提交前人工核对。
- **提交规范**：conventional commits（commitlint 校验）；husky pre-commit = 自动重生成 OpenAPI 契约 + lint-staged（eslint --fix）并暂存生成物。改 api 源码后若 typecheck 报 schema.d.ts 缺类型，说明生成产物陈旧，先跑 generate:openapi + generate:types。
- **响应契约**：成功 `{ code: 0, data, message }`；错误 `{ code, message }` + 状态码（400 校验 / 401 未登录 / 403 无权限 / 404 不存在 / 409 唯一冲突）；接口错误码不依赖 HTTP 语义，以 body.code 为准。
- **注释与文案用中文**，与现有代码一致；schema docstring 全字段中文。

## 文档索引

- `docs/superpowers/specs/2026-08-06-rbac-admin-design.md` — 设计文档：§6 权限模型、§7 API 清单、§8 前端架构、§9 种子数据、§9.1 智能体资产、§11 三方言
- `docs/superpowers/plans/2026-08-06-rbac-admin.md` — 实施计划（任务粒度）
- `docs/database/README.md` — 数据库文档（权限语义速查 + 三方言差异表 + 切库步骤）
- `.claude/skills/add-page` — 新增页面全流程（菜单 → 组件 → 权限码 → OpenAPI → 测试）
- `.claude/skills/switch-database` — SQLite/MySQL/PostgreSQL 切换清单
