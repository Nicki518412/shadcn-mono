# shadcn-mono：RBAC 管理端 SPA 设计文档

- 日期：2026-08-06
- 状态：已确认（用户批准）
- 后续：本文件为实施计划的唯一输入

## 1. 目标

基于 shadcn-ui 构建一套完整的管理端 SPA（monorepo，Turborepo）：

- 内置：登录（三种方式）、认证、用户管理 CRUD、角色管理 CRUD、菜单管理 CRUD
- 权限模型：用户 ↔ 多角色；可见权限 = 所有角色权限集合的**纯严格交集**（无超管例外）
- 菜单：多层级树；类型 DIR（目录）/ MENU（菜单）/ BUTTON（按钮）；外层列表不显示按钮，按钮只挂在 MENU 下
- 认证层可插拔：内置 JWT 认证 + Clerk 适配器（本期实现），环境变量切换
- 数据库三方言可切换：SQLite / MySQL / PostgreSQL（Prisma）

## 2. 技术栈（已确认）

| 层 | 选型 | 理由 |
|---|---|---|
| 后端 | Hono + @hono/zod-openapi | 轻量现代，zod schema 同时驱动校验、OpenAPI 文档、类型 |
| ORM | Prisma | 三方言统一支持、迁移、类型安全 |
| 数据库 | SQLite（默认开发）/ MySQL / PostgreSQL | provider 切换 |
| 前端 | Vite + React 19 + React Router + TanStack Query + shadcn-ui（**严格 CLI 管理**） | 管理端 SPA 标准组合 |
| 认证 | 双 Token（access 5min + refresh 7d，refresh 存库可吊销、轮换）+ OTP（邮箱/手机动态码） | 主流、可吊销 |
| 认证抽象 | AuthProvider 接口 + JwtAuthProvider + ClerkAuthProvider | 可插拔 |
| 包管理/编排 | pnpm + Turborepo | monorepo 标配 |
| 测试 | Vitest（shared 单元、api 集成、web 组件/行为） | 轻量统一 |
| API 文档 | OpenAPI（@hono/zod-openapi 生成 + Swagger UI + openapi-typescript 前端类型） | 单一来源 |

## 3. Monorepo 结构

```
shadcn-mono/
├── apps/
│   ├── web/            # Vite + React SPA（含 components.json，shadcn 组件由 CLI 安装在 src/components/ui/）
│   └── api/            # Hono + Prisma
├── packages/
│   ├── db/             # Prisma schema、client、种子脚本
│   ├── shared/         # 权限纯函数 + 共享类型
│   └── config/         # eslint / tsconfig / tailwind 共享配置
├── pnpm-workspace.yaml
├── turbo.json          # dev / build / lint / test
├── CLAUDE.md           # 项目总览（结构/命令/规范要点），供 Claude Code 开发本仓库
├── .mcp.json           # codegraph 等 MCP 配置
├── .claude/skills/     # 项目开发技能（见 §9.1）
└── docs/superpowers/specs/
```

依赖方向：`web → shared`；`api → db, shared`；`db → shared`（类型）。`shared` 不依赖任何框架（纯函数 + 类型）。

> **无 `packages/ui` 包**：shadcn 组件是源码拷贝而非 npm 包；本项目只有一个前端应用，registry 模式（components.json 位于 apps/web）是官方推荐做法，包化无收益。

## 4. 数据模型（Prisma，三方言可移植）

### User

| 字段 | 类型 | 约束 |
|---|---|---|
| id | String (cuid) | PK |
| username | String | unique，**统一小写存储** |
| passwordHash | String（NOT NULL） | **空字符串约定**：仅 Clerk 用户为空串（实现已定为非空字段 + 空串语义，Task 7 校验 `!user.passwordHash`） |
| nickname | String | |
| email | String? | unique，可空 |
| telephone | String? | unique，可空 |
| clerkId | String? | unique，可空（Clerk 用户映射） |
| status | Boolean | 启用/禁用，默认 true |
| createdAt / updatedAt | DateTime | |

### Role

| 字段 | 类型 | 约束 |
|---|---|---|
| id | String (cuid) | PK |
| name | String | |
| code | String | unique，如 `ADMIN` |
| description | String? | |
| sort | Int | 默认 0 |
| status | Boolean | 默认 true |
| createdAt / updatedAt | DateTime | |

### Menu（自关联树）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | String (cuid) | PK |
| parentId | String? | 自关联，null = 根 |
| name | String | |
| type | String | `"DIR" \| "MENU" \| "BUTTON"`（**字符串 + zod 校验，不用 Prisma enum**，SQLite 兼容） |
| path | String? | MENU 必填（路由路径，如 `/system/user`） |
| component | String? | MENU 必填（前端组件注册 key） |
| icon | String? | DIR/MENU 用（lucide 图标名） |
| permission | String? | MENU/BUTTON 的权限码，如 `system:user:add`；应用层校验唯一（可空 unique，三方言允许多 NULL） |
| sort | Int | 同层排序，默认 0 |
| status | Boolean | 默认 true |
| createdAt / updatedAt | DateTime | |

**字段注释规范（强制）**：
- Prisma schema 中**每个字段**写 `/// 中文注释`（docstring）
- 同步维护 **`docs/database/schema.sql`**：一份 MySQL 方言 DDL，**全部表与字段带 `COMMENT` 注释**，作为开发者速查文档（运行时权威仍是 Prisma，SQL 文件与 schema 双源，改动必须同步——README 内声明该约定）
- 方言注释差异：SQLite 无 COMMENT 语法（用 `--` 行注释）；PostgreSQL 用 `COMMENT ON COLUMN` 语句（可在 README 附差异说明，主文件用 MySQL 语法）

**树类型约束**（后端校验 + 前端限制）：
- DIR → 子节点只能是 DIR / MENU
- MENU → 子节点只能是 BUTTON
- BUTTON → 无子节点

### 关系表

- **UserRole**：`userId + roleId`，`@@unique([userId, roleId])`，Cascade 删除
- **RoleMenu**：`roleId + menuId`，`@@unique([roleId, menuId])`，Cascade 删除
- **RefreshToken**：`id, userId, tokenHash(unique), expiresAt, revokedAt?, createdAt`
- **OtpCode**：`id, channel("EMAIL"|"TELEPHONE"), target, codeHash, expiresAt, attempts(默认0), consumedAt?, createdAt`

## 5. 认证设计

### 三种登录方式

1. **账号 + 密码**：bcrypt 校验
2. **邮箱 + 动态码**
3. **手机号 + 动态码**

### OTP 流程（`POST /auth/otp/send` + `POST /auth/otp/login`）

- send：60s 冷却（按 target）、6 位数字码、哈希入库、5 分钟过期、**目标不存在也返回成功**（防枚举）、通过 **OtpSender 抽象**投递
- login：校验未消费 + 未过期 + attempts < 5（失败累加）、成功后标记 consumedAt 一次性消费

**OtpSender 抽象**（`apps/api/src/auth/otp-sender.ts`）：

```ts
interface OtpSender {
  sendEmail(to: string, code: string): Promise<void>
  sendSms(to: string, code: string): Promise<void>
}
```

本期仅实现 `DevOtpSender`（打印到控制台/日志）。真实短信/邮件通道由使用者注入（README 说明）。

### 双 Token

- access：5 分钟，无状态 JWT（HS256），payload 含 userId
- refresh：7 天，**随机串哈希存库**，支持吊销
- `POST /auth/refresh`：校验（存在、未吊销、未过期、用户未禁用）→ **轮换**（旧 refresh 标记吊销，签发新 refresh + 新 access）
- `POST /auth/logout`：吊销当前 refresh
- 账号禁用后：refresh 校验用户 status，立即失效

### 登录限流

密码连续错误 5 次 → 该账号锁定 15 分钟（内存记录即可，不落库）。

## 6. 权限模型（核心规则）

### 6.1 计算规则（纯函数，位于 `packages/shared`）

```
可见权限 = ∩(用户所有角色的 RoleMenu 菜单集合)
```

- **纯严格交集**：任一角色为空集合 ⇒ 用户无权限；无任何角色同理。无超管例外。
- **祖先补全**（唯一偏离字面交集的规则，保证导航可达）：交集内节点若祖先目录不在交集中，祖先目录强制进入导航树。若角色的勾选是父子独立的（勾选子菜单不强制勾选父目录），此规则必不可少。
- **空目录折叠**：交集后无可见子孙的目录不出现在导航树。
- **按钮权限**：BUTTON 节点同样参与交集，但只用于页面内按钮显隐，不进入侧边栏、不参与动态路由。

### 6.2 函数签名（`packages/shared/src/permissions.ts`）

```ts
// 输入：每个角色的已授权 menuId 列表；输出：导航树 + 权限码集合
function computeVisibleMenus(
  roleMenuIdsList: string[][],   // 每元素 = 一个角色的授权集合
  allMenus: MenuNode[],          // 全量菜单（含按钮）
): { navTree: MenuNode[]; permissionCodes: Set<string> }

// 辅助：buildTree(menus) / ancestorsOf(id) / pruneEmptyDirs(tree)
```

`permissionCodes` = 交集内所有 MENU + BUTTON 的 `permission` 字段集合（供前端按钮级显隐与后端接口裁决共用）。

### 6.3 权限码规范

`模块:资源:操作`，如 `system:user:query` / `system:user:create` / `system:user:update` / `system:user:delete` / `system:user:assign-role`。种子数据全量覆盖三张管理页。

### 6.4 后端裁决

Hono 中间件 `requirePermission("system:user:add")`：认证后实时计算交集（数据量小，不缓存），比对权限码，无权 → 403。接口与权限码映射见 §7。

## 7. API 设计（OpenAPI 三合一）

- 全部路由用 **@hono/zod-openapi** 定义：zod schema 驱动 ①请求校验 ②OpenAPI 文档 ③响应类型
- 运行期产出 `/api/openapi.json`；Swagger UI 挂 `/api/docs`
- 前端类型单一来源：**openapi-typescript** 从 `openapi.json` 生成类型，`apps/web` 与 `packages/shared` 引用生成结果，不手写 DTO
- 响应包装：`{ code: 0, data, message }`；错误：`{ code, message }` + 统一状态码（400 校验 / 401 未登录 / 403 无权限 / 404 不存在 / 409 唯一冲突）
- 路由前缀：`/api`

### 认证（公开，无需登录）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | `{ username, password }` → `{ accessToken, refreshToken, user }` |
| POST | `/api/auth/otp/send` | `{ channel, target }` → 投递动态码 |
| POST | `/api/auth/otp/login` | `{ channel, target, code }` → 同 login 响应 |
| POST | `/api/auth/refresh` | `{ refreshToken }` → 轮换发新双 Token |
| POST | `/api/auth/logout` | `{ refreshToken }` → 吊销 |
| GET | `/api/auth/me` | 登录即可：user + roles + navTree（已计算交集）+ permissionCodes |

### 用户管理（权限码：`system:user:*`）

| 方法 | 路径 | 权限码 | 说明 |
|---|---|---|---|
| GET | `/api/users` | query | 分页 + keyword（用户名/昵称/邮箱/手机模糊） |
| POST | `/api/users` | create | 创建（含密码、可选 email/telephone、角色） |
| GET | `/api/users/:id` | query | 详情 + 已挂角色 |
| PATCH | `/api/users/:id` | update | 含可选 `password` 字段（改密码）、可选角色 |
| DELETE | `/api/users/:id` | delete | 禁止删除自己 |
| PUT | `/api/users/:id/roles` | assign-role | `{ roleIds }` 全量提交 |

### 角色管理（权限码：`system:role:*`）

| 方法 | 路径 | 权限码 | 说明 |
|---|---|---|---|
| GET | `/api/roles` | query | 分页 + keyword |
| GET | `/api/roles/list` | query | 全量（下拉框/分配用） |
| POST | `/api/roles` | create | 创建 |
| GET | `/api/roles/:id` | query | 详情 |
| PATCH | `/api/roles/:id` | update | |
| DELETE | `/api/roles/:id` | delete | 删除角色时自动清理 UserRole（用户侧不受影响） |
| GET | `/api/roles/:id/menus` | query | 已授权 menuId 数组（树形勾选回显） |
| PUT | `/api/roles/:id/menus` | assign | `{ menuIds }` 全量提交（**含按钮节点**） |

### 菜单管理（权限码：`system:menu:*`）

| 方法 | 路径 | 权限码 | 说明 |
|---|---|---|---|
| GET | `/api/menus/tree` | query | 全量树（含按钮，管理页用）。**外层列表只显示 DIR/MENU**：树形表格默认折叠，BUTTON 行仅在展开其所属 MENU 时可见 |
| POST | `/api/menus` | create | 创建，校验类型约束 + 权限码唯一 |
| GET | `/api/menus/:id` | query | 详情 |
| PATCH | `/api/menus/:id` | update | 含改父节点（校验类型约束、禁止挂到自身子树） |
| DELETE | `/api/menus/:id` | delete | 级联删除子树 + 清理 RoleMenu |

## 8. 前端架构

```
apps/web/src/
├── auth/
│   ├── types.ts            # Session / LoginCredential 联合类型
│   ├── AuthProvider.tsx    # 接口 + Context + useAuth()：login(三种凭据)/sendOtp/logout/useSession
│   ├── JwtAuthProvider.tsx # axios 实例 + 拦截器自动 refresh（并发排队）+ 401 跳登录
│   └── ClerkAuthProvider.tsx # 包装 @clerk/clerk-react，登录页渲染 <SignIn />，后端按 clerkId 映射本地用户
├── router/
│   ├── generateRoutes.ts   # /auth/me 的 navTree → React Router 路由（component 字段 → lazy import 映射）
│   └── guards.tsx          # RequireAuth / 403 兜底
├── components/
│   ├── ui/                 # shadcn 组件（CLI 安装，勿手写）
│   └── business/           # 业务组合组件：Permission、树表格、树形勾选等
├── layout/                 # 官方 sidebar 组件 + 动态菜单 + 顶栏（用户/登出）
├── features/               # users / roles / menus 三张管理页
└── pages/                  # Login（三 Tab）/ Dashboard / 403 / 404
```

**关键决策**：
- 服务端状态用 TanStack Query；**不引入 zustand/redux**（会话状态由 AuthProvider Context 承担）
- 动态路由：登录后拉取 `/auth/me` → 生成路由与侧边栏；刷新时先静默拉 `me` 再渲染
- 登录页三 Tab（账号密码 / 邮箱动态码 / 手机动态码）；`VITE_AUTH_PROVIDER=clerk` 时渲染 Clerk `<SignIn />`
- shadcn-ui 组件（全部 CLI 安装）：button / input / card / table / dialog / form（FieldGroup+Field 体系）/ select / switch / tabs / badge / checkbox / dropdown-menu / sheet / sonner / skeleton / avatar / tooltip / alert-dialog / separator / pagination / **sidebar**（官方侧边栏，管理端布局）/ **input-otp**（动态码输入）/ spinner / empty 等
- 树形表格、树形勾选：实施时先 `npx shadcn@latest search` 官方与社区 registry（官方 tree-view 类组件可用则直接 add）；无现成才在 `components/business/` 自实现（属业务组合，非基础 UI）
- 按钮级权限：`<Permission code="...">` 包裹 + `usePermissionCodes()` hook

### 8.1 shadcn 组件管理规范（严格 CLI）

1. `apps/web` 内维护 `components.json`，由 `npx shadcn@latest init` 生成（Vite + React Router 官方模板）
2. 所有组件一律 `npx shadcn@latest add <component>` 安装到 `src/components/ui/`；**禁止手写、复制、粘贴组件源码**
3. 升级/修复走 CLI 流程：`add --dry-run` → `--diff` 逐文件合并（见 shadcn 技能）
4. 新 UI 需求先 `search` registry，再考虑自实现；组件使用遵循技能规则（语义色、FieldGroup、data-icon、无 space-y 等）
5. 样式主题由 init 生成（Tailwind v4 CSS 变量），全局样式只改 `src/index.css` 一处

## 9. 种子数据（`packages/db/src/seed.ts`，幂等可重跑）

**菜单树**：

```
Dashboard（MENU, path=/, component=dashboard）
系统管理（DIR）
├── 用户管理（MENU, /system/user, component=system/user, permission=system:user:query）
│   ├── 用户新增（BUTTON, system:user:create）
│   ├── 用户编辑（BUTTON, system:user:update）
│   ├── 用户删除（BUTTON, system:user:delete）
│   └── 分配角色（BUTTON, system:user:assign-role）
├── 角色管理（MENU, /system/role, component=system/role, permission=system:role:query）
│   ├── 角色新增 / 编辑 / 删除 / 分配权限
└── 菜单管理（MENU, /system/menu, component=system/menu, permission=system:menu:query）
    ├── 菜单新增 / 编辑 / 删除
```

**角色**：`ADMIN` 管理员（勾选全部菜单+按钮）、`GUEST` 访客（仅 Dashboard）
**用户**：`admin / Admin@123`（挂 ADMIN；email=admin@example.com，telephone=13800138000，便于演示三种登录）
密码 scrypt 哈希入库（node:crypto，N=2^17，实现位于 packages/db/src/lib/password.ts）。

## 9.1 智能体开发辅助资产（仅开发辅助层，已确认 B 方案）

面向 **Claude Code 开发本仓库**，不提供面向外部智能体的 MCP server：

- **CLAUDE.md**：项目结构、常用命令、目录职责、规范要点（shadcn 严格 CLI、权限规则位置、三方言约定）
- **`.mcp.json`**：codegraph MCP 配置（本仓库启用索引后可直接查询代码）
- **`.claude/skills/`**（1-2 个高价值项目技能，不贪多）：
  - `add-page`：新增页面的完整流程——菜单树 → 动态路由注册（component key）→ 权限码 → shadcn CLI 组件 → 测试
  - `switch-database`：SQLite/MySQL/PostgreSQL 三方言切换的完整操作清单
  - 创建时遵循 superpowers:writing-skills 流程

## 10. 测试策略

| 层 | 范围 | 工具 |
|---|---|---|
| shared | `computeVisibleMenus`（交集/祖先补全/空目录折叠/权限码）、`buildTree` | Vitest 单元 |
| api | 认证：login 错误密码/锁定、OTP 全流程（冷却/过期/次数/一次性/防枚举）、refresh 轮换/吊销/禁用失效；CRUD：三张表增删改查、唯一冲突 409、菜单类型约束、子树级联删除；权限：requirePermission 401/403 | Vitest 集成（SQLite 内存库） |
| web | Permission 组件、AuthProvider 刷新拦截（mock）、登录表单校验 | Vitest + RTL |

验收：`pnpm turbo test` 全绿 + `pnpm turbo build` 通过。

## 11. 三方言可移植约定

- 不用 Prisma enum（字符串 + zod 校验）
- 用户名/邮箱/手机号：可空 unique（三方言均允许多个 NULL）；唯一冲突统一转 409
- 树操作：全量取回 + 内存建树，**不用递归 CTE**
- 不用 JSONB / 方言专属函数；时间统一 UTC
- 开发默认 SQLite（`file:./dev.db`）；切 MySQL/PG 改 `.env` 的 `DATABASE_URL` 与 Prisma `provider` 后重跑 `migrate` + `seed`（README 给出命令）

## 12. 非目标（本期不做）

拖拽排序、i18n、审计日志、导入导出、多租户、OAuth 第三方登录（Clerk 能力除外）、真实短信/邮件通道实现、**面向外部智能体的 MCP server（admin-mcp）**——智能体辅助仅限仓库内开发资产（§9.1）。

## 13. 交付范围

| 模块 | 内容 |
|---|---|
| apps/web | 登录（三方式）、官方 sidebar 动态侧边栏布局、Dashboard、用户/角色/菜单三张管理页、403/404、Permission 组件、树表格/树勾选、ClerkAuthProvider；shadcn 组件严格 CLI 管理（components.json + add） |
| apps/api | 认证/OTP/refresh/me、三张 CRUD、requirePermission 中间件、OpenAPI（openapi.json + Swagger UI）、seed、OtpSender 抽象 + DevOtpSender |
| packages | db（schema+client+seed）、shared（权限纯函数+类型）、config |
| 文档 | README：启动、三方言切换、接入真实 OtpSender、配置 Clerk 密钥、OpenAPI 用法；**docs/database/schema.sql（全字段注释的 MySQL DDL）+ docs/database/README.md（三方言差异、双源同步约定）** |
| 智能体资产 | CLAUDE.md、.mcp.json（codegraph）、.claude/skills/（add-page、switch-database） |

## 14. 开发流程

- `pnpm install` → `pnpm dev`（turbo 并发：web:5173、api:3001，Vite proxy `/api`）
- 实施顺序（写作实施计划时细化）：monorepo 骨架 → db + shared + seed → api 认证与权限中间件 → api CRUD → web 骨架与登录 → web 管理页 → Clerk 适配 + 测试补齐 + README
