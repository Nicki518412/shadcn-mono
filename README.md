# shadcn-mono

RBAC 管理端 monorepo：**Hono + zod-openapi** 后端、**Vite + React + shadcn-ui** 前端、**Prisma** 数据库层（SQLite / MySQL / PostgreSQL 三方言可移植）。支持账号密码、邮箱/手机动态码、Clerk 三种登录方式；权限模型为多角色**纯严格交集**（无超管例外）。

## 仓库结构

```
apps/
├── api/          # Hono 后端（OpenAPI 三合一：zod 驱动校验/文档/类型），端口 3001
└── web/          # Vite + React + shadcn-ui 前端，端口 5173（/api 代理到 3001）
packages/
├── db/           # Prisma schema（运行时权威）+ 幂等种子（packages/db/src/seed.ts）
├── shared/       # 权限纯函数（computeVisibleMenus，权限计算的唯一位置）
└── config/       # 共享 tsconfig / eslint 配置
docs/             # 设计文档（docs/superpowers/）+ 数据库文档（docs/database/）
CLAUDE.md         # 智能体开发指南；.claude/skills/ 项目技能；.mcp.json codegraph
```

## 快速开始

要求：Node >= 22（@testing-library/jest-dom@7 的 engines 下限），pnpm 9.x（`packageManager: pnpm@9.12.0`）。

```bash
pnpm install              # postinstall 自动 prisma generate

# 环境变量（首次）
cp apps/api/.env.example apps/api/.env    # api dev 脚本依赖 --env-file=.env
cp apps/web/.env.example apps/web/.env    # 可选，默认 local 模式
# 另需 packages/db/.env（Prisma 命令以 packages/db 为 cwd 时加载；默认 SQLite）：
#   DATABASE_URL="file:./dev.db"

pnpm --filter @repo/db seed   # 种子（幂等可重跑；会重置 admin 口令与演示联系方式）
pnpm dev                      # web http://localhost:5173 / api http://localhost:3001
```

默认账号 **admin / Admin@123**（ADMIN 角色，已授权全部菜单；email=admin@example.com、telephone=13800138000，便于演示三种登录）。

## 测试与构建

```bash
pnpm turbo test     # shared 单元 + api 集成 + web RTL
pnpm turbo build
pnpm turbo lint
```

生产启动前必须设置至少 32 字符的随机 `JWT_SECRET`；缺失或继续使用开发占位值时，API 会拒绝以 `NODE_ENV=production` 启动。

```bash
pnpm turbo build
pnpm --filter @repo/api start
```

api 集成测试每次运行前自动重建 SQLite 测试库（`apps/api/test/setup.ts` 执行 `db push --force-reset`），不影响开发库。

## 切换数据库（SQLite / MySQL / PostgreSQL）

三方言差异表与完整约定见 **[docs/database/README.md](docs/database/README.md)**。核心三步：

1. `packages/db/.env` 改 `DATABASE_URL`
2. `packages/db/prisma/schema.prisma` 改 `datasource.db.provider`（sqlite / mysql / postgresql）
3. 迁移 + 种子：`pnpm --filter @repo/db db:migrate -- --name switch` → `pnpm --filter @repo/db seed`

## 接入真实短信/邮件通道（OtpSender）

动态码发送入口为 `apps/api/src/lib/otp-sender.ts` 的 `OtpSender` 接口：

```ts
export interface OtpSender {
  sendEmail(to: string, code: string): Promise<void>
  sendSms(to: string, code: string): Promise<void>
}
```

开发/测试环境使用 `DevOtpSender`：验证码打印到控制台，并仅保存在当前进程内供测试读取，数据库始终只存 sha256 哈希。生产环境默认禁用 Dev 实现；接入真实通道时实现该接口（调用短信/邮件服务商 API）并替换导出。

> **开发模式提示**：使用邮箱/手机动态码登录时，验证码打印在 **api 进程的控制台**（`[DevOtpSender] EMAIL/SMS → 目标: 验证码 xxxxxx`）——登录页不再展示该提示，留意运行 `pnpm dev` 的终端输出。

> 动态码业务参数（5 分钟有效、60 秒冷却、5 次尝试上限、sha256 存储）见 `apps/api/src/routes/otp.ts`。

## 接入 Clerk 登录

Clerk 模式 = Clerk 托管登录页 + 本地 RBAC 授权（按 `clerkId` 映射本地用户，**首次登录自动建号**）。

1. dashboard.clerk.com → API Keys 获取密钥
2. 前端 `.env`：`VITE_AUTH_PROVIDER=clerk` + `VITE_CLERK_PUBLISHABLE_KEY="pk_..."`
3. 后端 `.env`：`AUTH_PROVIDER=clerk` + `CLERK_SECRET_KEY="sk_..."`

两端 provider 必须一致（`local` / `clerk`）。前端 `VITE_AUTH_PROVIDER=clerk` 时登录页渲染 `<SignIn />`；后端 `AUTH_PROVIDER=clerk` 时认证中间件改为校验 Clerk session token（`apps/api/src/middleware/clerk-auth.ts`）。自动建号：username 取邮箱前缀清洗唯一化、passwordHash 为空串（Clerk 用户约定）、email 取第一个并统一小写。

**已知限制**：

- **Clerk 邮箱撞本地账号**（email 唯一索引冲突）→ 返回 409「该邮箱已被本地账号使用，请联系管理员」，**不自动关联**；需管理员在用户管理页人工处理。
- **本地账号被禁用**（`status=false`）时，Clerk 登录会循环失败（每次认证即 401，Clerk 侧感知不到禁用状态）——需管理员在 Clerk Dashboard 吊销该用户会话。
- 并发首次登录竞态已处理：双请求同时建号时按 `clerkId` 复用胜者（自愈），不会重复建号。

## OpenAPI

- Swagger UI：`/api/docs`（JSON 契约：`/api/openapi.json`）
- 修改 API 源码后重新生成契约与前端类型：

```bash
pnpm --filter @repo/api generate:openapi   # → apps/api/openapi.json
pnpm --filter @repo/api generate:types     # → apps/web/src/api/schema.d.ts
```

`apps/api/src/**/*.ts` 变更时，pre-commit 钩子（husky + lint-staged）会自动重生成并暂存这两份产物，提交时无需手动执行；若 typecheck 报 schema.d.ts 缺类型，先手动补跑上述两条命令。

## 权限模型

可见权限 = 用户所有角色授权菜单集合的**纯严格交集**（任一角色为空集合 ⇒ 无权限，无超管例外）：

- BUTTON 节点同样参与交集，仅用于页面内按钮显隐，不进侧边栏、不参与动态路由
- 导航树做祖先补全（保证可达）+ 空目录折叠
- 权限码规范 `模块:资源:操作`（如 `system:user:create`）

| 环节 | 位置 |
|---|---|
| 计算（唯一） | `packages/shared/src/permissions.ts`（纯函数） |
| 后端裁决 | `requirePermission(code)` 中间件（`apps/api/src/middleware/auth.ts`），无权 403 |
| 前端按钮显隐 | `<Permission code="...">` / `usePermissionCodes()`（`apps/web/src/components/business/Permission.tsx`） |

完整定义见设计文档 §6 与 [docs/database/README.md](docs/database/README.md)「权限语义速查」。

## 开发辅助（智能体资产）

- `CLAUDE.md`：仓库指南（结构 / 命令 / 规范）
- `.mcp.json`：codegraph 代码图谱 MCP 配置
- `.claude/skills/`：`add-page`（新增页面全流程）、`switch-database`（三方言切库清单）
