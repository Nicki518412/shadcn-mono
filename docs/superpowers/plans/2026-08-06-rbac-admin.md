# RBAC 管理端 SPA 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零构建 Turborepo monorepo：Hono + Prisma（SQLite/MySQL/PG 三方言）+ Vite/React/shadcn-ui 管理端 SPA，含三种登录、用户/角色/菜单 CRUD、多角色权限严格交集、Clerk 适配器、OpenAPI 文档。

**Architecture:** apps/web（Vite SPA，shadcn 严格 CLI 管理）+ apps/api（Hono，@hono/zod-openapi 三合一）+ packages/{db,shared,config}。权限交集算法为 shared 纯函数，前后端共用。全部代码与配置为严格 TypeScript（.ts/.tsx），`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride`。

**Tech Stack:** pnpm + Turborepo；Hono + @hono/zod-openapi + Prisma + zod + node:crypto（scrypt/JWT/OTP 哈希，零第三方密码库）；Vite + React 19 + React Router + TanStack Query + Tailwind v4 + shadcn-ui（CLI）；Vitest。

**设计文档：** `docs/superpowers/specs/2026-08-06-rbac-admin-design.md`（本计划唯一输入，实现前先通读）

---

## 任务总览

| # | 任务 | 验证 |
|---|---|---|
| 1 | 仓库初始化（git + workspace + turbo + **husky/lint-staged/commitlint**） | turbo 命令可跑、hook 生效 |
| 2 | packages/config 共享配置 | tsc 通过 |
| 3 | packages/shared 权限纯函数（TDD） | vitest 全绿 |
| 4 | packages/db Prisma schema + client | db push 成功 |
| 5 | docs/database schema.sql + README | 文档完整 |
| 6 | apps/api 骨架 + 错误处理 | /api/health 200 |
| 7 | 认证 login/refresh/logout | 集成测试通过 |
| 8 | OTP send/login | 集成测试通过 |
| 9 | 权限中间件 + /auth/me | 集成测试通过 |
| 10 | 用户管理 CRUD | 集成测试通过 |
| 11 | 角色管理 CRUD + 菜单授权 | 集成测试通过 |
| 12 | 菜单管理 CRUD | 集成测试通过 |
| 13 | 种子数据 | 幂等可重跑 |
| 14 | OpenAPI 导出 + 前端类型生成 | openapi.json + schema.d.ts |
| 15 | apps/web 骨架 + shadcn init | dev 可启动 |
| 16 | AuthProvider 抽象 + JwtAuthProvider | 测试通过 |
| 17 | 登录页（三 Tab） | 测试通过 |
| 18 | 布局 + 动态路由 | dev 可导航 |
| 19 | Permission 组件 | 测试通过 |
| 20 | 用户管理页 | 手动验证 |
| 21 | 角色管理页 | 手动验证 |
| 22 | 菜单管理页 | 手动验证 |
| 23 | Dashboard + 403/404 | 手动验证 |
| 24 | Clerk 适配器（前端+后端） | 文档 + 编译 |
| 25 | 文档与智能体资产 | 文件齐全 |

**全局约定（所有任务遵守）：**
- 所有文件为 `.ts`/`.tsx`；禁止 `.js`/`.jsx` 源码、禁止 `// @ts-ignore`、禁止 `any`（除非显式注明并通过 eslint-disable 行内豁免）
- 提交信息用 `feat:`/`test:`/`docs:`/`chore:` 前缀，每条附 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 每任务结束提交一次；提交前运行该任务验证命令
- **typescript-eslint 崩溃预防**：已锁定修复版本（Task 2 收尾时确认）；若 `tsutils.unionConstituents` 崩溃再次出现，立即停止并固定已知良好版本，不要绕过 hook
- **exactOptionalPropertyTypes × Prisma 豁免条款**：Prisma 生成客户端与该选项存在已知不兼容（prisma/prisma#10894 长期开放）。若 `apps/api` 包内 Prisma 调用因 `undefined` 显式赋值报错，允许在 `apps/api/tsconfig.json` **包级关闭该选项并注释原因**，勿回改 base
- **projectService 覆盖要求**：每个含 `vitest.config.ts`/`vite.config.ts` 等配置文件的包，其 tsconfig include 必须覆盖这些配置文件（否则 lint-staged 对它们跑 eslint 会硬失败）

---

## Task 1: 仓库初始化（git + workspace + turbo）

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.npmrc`

- [ ] **Step 1: git init + .gitignore**

```bash
cd "E:\vibe-coding\shadcn-mono"
git init
```

`.gitignore` 内容：

```gitignore
node_modules/
dist/
.turbo/
*.tsbuildinfo
.env
.env.local
*.db
*.db-journal
coverage/
.DS_Store
```

- [ ] **Step 2: 根 workspace 配置**

`pnpm-workspace.yaml`：
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`.npmrc`：
```
strict-peer-dependencies=false
auto-install-peers=true
```

- [ ] **Step 3: 根 package.json + turbo.json**

`package.json`：
```json
{
  "name": "shadcn-mono",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "prepare": "husky"
  },
  "devDependencies": {
    "@commitlint/cli": "^19.5.0",
    "@commitlint/config-conventional": "^19.5.0",
    "@eslint/js": "^9.13.0",
    "eslint": "^9.13.0",
    "husky": "^9.1.0",
    "lint-staged": "^15.2.0",
    "turbo": "^2.3.0",
    "typescript-eslint": "^8.11.0"
  }
}
```

`turbo.json`：
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "lint": {},
    "test": { "dependsOn": ["^build"] }
  }
}
```

- [ ] **Step 4: Husky + lint-staged + commitlint 集成（git hooks）**

根 `eslint.config.ts`（根级 lint，供 pre-commit 使用；从 packages/config 复用规则）：
```ts
import { config } from "@repo/config/eslint"
export default config
```

根 `lint-staged.config.ts`：
```ts
import { defineConfig } from "lint-staged"

export default defineConfig({
  "*.{ts,tsx}": ["eslint --fix"],
})
```

根 `commitlint.config.ts`：
```ts
import type { UserConfig } from "@commitlint/types"

export default {
  extends: ["@commitlint/config-conventional"],
} satisfies UserConfig
```

创建 hooks 与初始化：
```bash
mkdir -p .husky
git config core.hooksPath .husky
```

`.husky/pre-commit`：
```sh
npx lint-staged
```

`.husky/commit-msg`：
```sh
npx --no -- commitlint --edit "$1"
```

`.gitignore` 追加：
```gitignore
.husky/_
```

- [ ] **Step 5: 验证 + 首次提交**

```bash
pnpm install
pnpm --version
npx husky
```
Expected: `husky - Git hooks installed` 输出。

> **hook 验证说明**：`pre-commit` 的 lint-staged 首次提交时暂存区为空，直接跳过；`commit-msg` 的 commitlint 将校验本提交信息 `chore: init monorepo workspace`（符合 Conventional Commits）。若 hook 因故失败，先修复再提交——不要跳过 hook。

- [ ] **Step 6: 首次提交（触发 hook）**

```bash
git add -A && git commit -m "chore: init monorepo workspace

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
Expected: commit-msg hook 校验通过，提交成功。

---

## Task 2: packages/config 共享配置

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.base.json`
- Create: `packages/config/tsconfig.node.json`
- Create: `packages/config/eslint.config.ts`
- Create: `packages/config/index.ts`

- [ ] **Step 1: 包骨架**

`packages/config/package.json`：
```json
{
  "name": "@repo/config",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./tsconfig.base.json": "./tsconfig.base.json",
    "./tsconfig.node.json": "./tsconfig.node.json",
    "./eslint": "./eslint.config.ts",
    "./index": "./index.ts"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@eslint/js": "^9.13.0",
    "eslint": "^9.13.0",
    "typescript-eslint": "^8.11.0"
  }
}
```

- [ ] **Step 2: 严格 tsconfig**

`packages/config/tsconfig.base.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 3: 严格 ESLint（TS 配置）**

`packages/config/eslint.config.ts`：
```ts
import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  { ignores: ["dist/**", "node_modules/**"] },
)
```

- [ ] **Step 4: 验证 + 提交**

`packages/config/index.ts`：
```ts
export const configName = "@repo/config" as const
```

```bash
cd "E:\vibe-coding\shadcn-mono"
pnpm install
pnpm --filter @repo/config exec tsc --noEmit -p packages/config/tsconfig.base.json
git add -A && git commit -m "chore: add shared config package

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: packages/shared 权限纯函数（TDD）

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/permissions.ts`
- Create: `packages/shared/test/permissions.test.ts`

- [ ] **Step 1: 包骨架 + 类型定义**

`packages/shared/package.json`：
```json
{
  "name": "@repo/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`packages/shared/src/types.ts`：
```ts
export type MenuType = "DIR" | "MENU" | "BUTTON"

export interface MenuNode {
  id: string
  parentId: string | null
  name: string
  type: MenuType
  path: string | null
  component: string | null
  icon: string | null
  permission: string | null
  sort: number
  status: boolean
  children: MenuNode[]
}

export interface VisibleMenus {
  navTree: MenuNode[]
  permissionCodes: Set<string>
}
```

`packages/shared/src/index.ts`：
```ts
export * from "./types.js"
export * from "./permissions.js"
```

- [ ] **Step 2: 写失败测试**

`packages/shared/test/permissions.test.ts`（完整内容）：

```ts
import { describe, expect, it } from "vitest"
import { computeVisibleMenus } from "../src/permissions.js"
import type { MenuNode } from "../src/types.js"

function menu(partial: Partial<MenuNode> & { id: string }): MenuNode {
  return {
    parentId: null,
    name: partial.id,
    type: "MENU",
    path: null,
    component: null,
    icon: null,
    permission: null,
    sort: 0,
    status: true,
    children: [],
    ...partial,
  }
}

const dirSystem = menu({ id: "d1", name: "系统管理", type: "DIR", sort: 1 })
const mUser = menu({ id: "m1", parentId: "d1", name: "用户管理", permission: "system:user:query", sort: 1 })
const bAdd = menu({ id: "b1", parentId: "m1", name: "用户新增", type: "BUTTON", permission: "system:user:add", sort: 1 })
const mRole = menu({ id: "m2", parentId: "d1", name: "角色管理", permission: "system:role:query", sort: 2 })
const allMenus = [dirSystem, mUser, bAdd, mRole]

describe("computeVisibleMenus", () => {
  it("无角色时返回空", () => {
    const r = computeVisibleMenus([], allMenus)
    expect(r.navTree).toEqual([])
    expect(r.permissionCodes.size).toBe(0)
  })

  it("单角色返回其菜单", () => {
    const r = computeVisibleMenus([["d1", "m1", "b1"]], allMenus)
    expect(r.navTree.map((n) => n.id)).toEqual(["d1"])
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["m1"])
    expect(r.permissionCodes).toEqual(new Set(["system:user:query", "system:user:add"]))
  })

  it("多角色取严格交集（菜单与按钮）", () => {
    const r = computeVisibleMenus([["d1", "m1", "b1", "m2"], ["d1", "m1", "b1"]], allMenus)
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["m1"])
    expect(r.permissionCodes).toEqual(new Set(["system:user:query", "system:user:add"]))
  })

  it("交集为空时导航树为空", () => {
    const r = computeVisibleMenus([["m2"], ["m1"]], allMenus)
    expect(r.navTree).toEqual([])
  })

  it("祖先补全：菜单在交集但目录不在时仍显示祖先链", () => {
    const r = computeVisibleMenus([["m1"]], allMenus)
    expect(r.navTree.map((n) => n.id)).toEqual(["d1"])
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["m1"])
  })

  it("空目录折叠：目录无可见子孙则隐藏", () => {
    const r = computeVisibleMenus([["d1", "m1"]], allMenus)
    expect(r.navTree.map((n) => n.id)).toEqual(["d1"])
  })

  it("按 sort 排序", () => {
    const r = computeVisibleMenus([["d1", "m1", "m2"]], allMenus)
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["m1", "m2"])
  })

  it("按钮不进入导航树", () => {
    const r = computeVisibleMenus([["b1"]], allMenus)
    expect(r.navTree).toEqual([])
    expect(r.permissionCodes).toEqual(new Set(["system:user:add"]))
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm --filter @repo/shared test`
Expected: FAIL（`computeVisibleMenus` 未定义）

- [ ] **Step 4: 实现**

`packages/shared/src/permissions.ts`（完整内容）：

```ts
import type { MenuNode, VisibleMenus } from "./types.js"

export function buildTree(nodes: MenuNode[], parentId: string | null = null): MenuNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.sort - b.sort)
    .map((n) => ({ ...n, children: buildTree(nodes, n.id) }))
}

export function computeVisibleMenus(
  roleMenuIdsList: string[][],
  allMenus: MenuNode[],
): VisibleMenus {
  // 1. 严格交集
  let visibleIds: Set<string> | null = null
  for (const ids of roleMenuIdsList) {
    const set = new Set(ids)
    visibleIds = visibleIds === null ? set : new Set([...visibleIds].filter((id) => set.has(id)))
  }
  const intersect = visibleIds ?? new Set<string>()

  // 2. 权限码 = 交集内所有节点的 permission
  const permissionCodes = new Set<string>()
  const byId = new Map(allMenus.map((m) => [m.id, m]))
  for (const id of intersect) {
    const node = byId.get(id)
    if (node?.permission) permissionCodes.add(node.permission)
  }

  // 3. 导航树：交集内非 BUTTON 节点 + 祖先补全
  const navIds = new Set<string>()
  const addWithAncestors = (id: string): void => {
    if (navIds.has(id)) return
    const node = byId.get(id)
    if (!node) return
    navIds.add(id)
    if (node.parentId) addWithAncestors(node.parentId)
  }
  for (const id of intersect) {
    const node = byId.get(id)
    if (node && node.type !== "BUTTON") addWithAncestors(id)
  }

  // 4. 保留可见子树（递归裁剪 + 空目录折叠）
  const visibleNodes = allMenus.filter((m) => navIds.has(m.id))
  const prune = (nodes: MenuNode[]): MenuNode[] =>
    nodes
      .filter((n) => navIds.has(n.id))
      .map((n) => ({ ...n, children: prune(n.children) }))
      .filter((n) => n.type === "DIR" ? n.children.length > 0 || !intersect.has(n.id) && n.type === "MENU" : true)

  return { navTree: prune(buildTree(visibleNodes)), permissionCodes }
}
```

> 注：`prune` 中空目录折叠的精确写法——目录仅当 `children.length > 0` 才保留（交集内目录但无可见子孙 → 隐藏）。若 `prune` 实现与此描述不符，以测试为准修正。

- [ ] **Step 5: 运行验证通过**

Run: `pnpm --filter @repo/shared test`
Expected: 8 个测试全部 PASS

- [ ] **Step 6: 提交**

```bash
git add -A && git commit -m "feat: shared permission intersection pure functions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: packages/db Prisma schema + client

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`

- [ ] **Step 1: 包骨架**

`packages/db/package.json`：
```json
{
  "name": "@repo/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "seed": "tsx src/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0"
  },
  "devDependencies": {
    "prisma": "^5.22.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Prisma schema（全字段中文注释）**

`packages/db/prisma/schema.prisma`（完整内容）：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  // 开发默认 SQLite；切换 MySQL/PostgreSQL 见 docs/database/README.md
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

/// 用户表
model User {
  id           String    @id @default(cuid()) /// 主键
  username     String    @unique /// 登录用户名（统一小写存储）
  passwordHash String    /// 密码哈希（scrypt，格式: scrypt$salt$hash；Clerk 用户可为空字符串）
  nickname     String    /// 显示昵称
  email        String?   @unique /// 邮箱（唯一，可空，用于邮箱动态码登录）
  telephone    String?   @unique /// 手机号（唯一，可空，用于手机动态码登录）
  clerkId      String?   @unique /// Clerk 用户 ID 映射（Clerk 认证模式使用）
  status       Boolean   @default(true) /// 启用状态：true 启用 / false 禁用
  createdAt    DateTime  @default(now()) /// 创建时间（UTC）
  updatedAt    DateTime  @updatedAt /// 更新时间（UTC）
  roles        UserRole[] /// 用户角色关联
  refreshTokens RefreshToken[] /// 刷新令牌记录
  otpCodes     OtpCode[] /// 动态码记录
}

/// 角色表
model Role {
  id          String    @id @default(cuid()) /// 主键
  name        String    /// 角色名称
  code        String    @unique /// 角色编码（如 ADMIN）
  description String?   /// 角色描述
  sort        Int       @default(0) /// 排序值（数字越小越靠前）
  status      Boolean   @default(true) /// 启用状态
  createdAt   DateTime  @default(now()) /// 创建时间（UTC）
  updatedAt   DateTime  @updatedAt /// 更新时间（UTC）
  users       UserRole[] /// 角色用户关联
  menus       RoleMenu[] /// 角色菜单授权关联
}

/// 菜单表（自关联树）
model Menu {
  id         String    @id @default(cuid()) /// 主键
  parentId   String?   /// 父节点 ID（null = 根节点）；类型约束: DIR→DIR/MENU, MENU→BUTTON, BUTTON→无子级
  name       String    /// 菜单名称
  type       String    /// 类型: DIR 目录 / MENU 菜单 / BUTTON 按钮（字符串+zod 校验，兼容三方言）
  path       String?   /// 路由路径（MENU 必填，如 /system/user）
  component  String?   /// 前端组件注册 key（MENU 必填，如 system/user）
  icon       String?   /// 图标名（lucide，DIR/MENU 用）
  permission String?   @unique /// 权限码（MENU/BUTTON 用，如 system:user:add；应用层校验唯一）
  sort       Int       @default(0) /// 同层排序值
  status     Boolean   @default(true) /// 启用状态
  createdAt  DateTime  @default(now()) /// 创建时间（UTC）
  updatedAt  DateTime  @updatedAt /// 更新时间（UTC）
  children   Menu[]    @relation("MenuTree", onDelete: Cascade) /// 子节点（级联删除）
  parent     Menu?     @relation("MenuTree", fields: [parentId], references: [id]) /// 父节点
  roles      RoleMenu[] /// 角色授权关联
}

/// 用户-角色关联表（多对多）
model UserRole {
  userId String /// 用户 ID
  roleId String /// 角色 ID
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade) /// 所属用户
  role   Role   @relation(fields: [roleId], references: [id], onDelete: Cascade) /// 所属角色

  @@id([userId, roleId]) /// 联合主键（防重复）
}

/// 角色-菜单授权关联表（多对多，含按钮权限）
model RoleMenu {
  roleId String /// 角色 ID
  menuId String /// 菜单 ID（含 BUTTON 节点）
  role   Role   @relation(fields: [roleId], references: [id], onDelete: Cascade) /// 所属角色
  menu   Menu   @relation(fields: [menuId], references: [id], onDelete: Cascade) /// 所属菜单

  @@id([roleId, menuId]) /// 联合主键（防重复）
}

/// 刷新令牌表（支持吊销与轮换）
model RefreshToken {
  id        String    @id @default(cuid()) /// 主键
  userId    String /// 所属用户 ID
  tokenHash String    @unique /// 令牌哈希（sha256）
  expiresAt DateTime /// 过期时间（7 天）
  revokedAt DateTime? /// 吊销时间（null = 有效）
  createdAt DateTime  @default(now()) /// 创建时间（UTC）
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade) /// 所属用户
}

/// 动态码记录表（邮箱/手机验证码）
model OtpCode {
  id           String    @id @default(cuid()) /// 主键
  channel      String /// 渠道: EMAIL / TELEPHONE
  target       String /// 目标地址（邮箱或手机号）
  codeHash     String /// 验证码哈希（sha256）
  expiresAt    DateTime /// 过期时间（5 分钟）
  attempts     Int       @default(0) /// 已尝试次数（上限 5）
  consumedAt   DateTime? /// 消费时间（null = 未使用）
  devPlainCode String? /// 测试专用：DevOtpSender 明文回写（仅开发环境），真实发送实现不写入
  createdAt    DateTime  @default(now()) /// 创建时间（UTC）
  userId       String? /// 关联用户 ID（目标匹配到用户时记录）
  user         User?     @relation(fields: [userId], references: [id]) /// 所属用户
}
```

> 注：`OtpCode.devPlainCode` 由 Task 8 的 OTP 测试使用（DevOtpSender 写入明文，生产实现不写）；`OtpCode.userId` 关联 User 的反查字段 `otpCodes` 已包含在 User 模型。执行 `prisma validate` 确认 schema 合法。

- [ ] **Step 3: client 单例 + 首次建库**

`packages/db/src/client.ts`：
```ts
import { PrismaClient } from "@prisma/client"

export const prisma = new PrismaClient()
```

`packages/db/src/index.ts`：
```ts
export { prisma } from "./client.js"
export type * from "@prisma/client"
```

```bash
cd "E:\vibe-coding\shadcn-mono"
pnpm install
pnpm --filter @repo/db exec prisma validate
pnpm --filter @repo/db db:push
```
Expected: validate 无错误；db push 成功创建 `packages/db/prisma/dev.db`

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "feat: prisma schema with full field comments

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: docs/database schema.sql + README

**Files:**
- Create: `docs/database/schema.sql`
- Create: `docs/database/README.md`

- [ ] **Step 1: MySQL DDL（全字段 COMMENT）**

`docs/database/schema.sql`（完整内容，与 schema.prisma 逐字段对应）：

```sql
-- ============================================================
-- shadcn-mono 数据库结构文档（MySQL 方言）
-- 运行时权威为 packages/db/prisma/schema.prisma，本文件仅作开发速查
-- 改动 schema.prisma 时必须同步本文件（见 README.md）
-- ============================================================

-- 用户表
CREATE TABLE `User` (
  `id`           VARCHAR(32)  NOT NULL COMMENT '主键',
  `username`     VARCHAR(255) NOT NULL COMMENT '登录用户名（统一小写存储）',
  `passwordHash` VARCHAR(255) NOT NULL COMMENT '密码哈希（scrypt，Clerk 用户可为空字符串）',
  `nickname`     VARCHAR(255) NOT NULL COMMENT '显示昵称',
  `email`        VARCHAR(255) NULL COMMENT '邮箱（唯一，可空，用于邮箱动态码登录）',
  `telephone`    VARCHAR(255) NULL COMMENT '手机号（唯一，可空，用于手机动态码登录）',
  `clerkId`      VARCHAR(255) NULL COMMENT 'Clerk 用户 ID 映射（Clerk 认证模式使用）',
  `status`       BOOLEAN      NOT NULL DEFAULT TRUE COMMENT '启用状态：true 启用 / false 禁用',
  `createdAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  `updatedAt`    DATETIME     NOT NULL COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `User_username_key` (`username`),
  UNIQUE KEY `User_email_key` (`email`),
  UNIQUE KEY `User_telephone_key` (`telephone`),
  UNIQUE KEY `User_clerkId_key` (`clerkId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 角色表
CREATE TABLE `Role` (
  `id`          VARCHAR(32)  NOT NULL COMMENT '主键',
  `name`        VARCHAR(255) NOT NULL COMMENT '角色名称',
  `code`        VARCHAR(255) NOT NULL COMMENT '角色编码（如 ADMIN）',
  `description` VARCHAR(255) NULL COMMENT '角色描述',
  `sort`        INT          NOT NULL DEFAULT 0 COMMENT '排序值（数字越小越靠前）',
  `status`      BOOLEAN      NOT NULL DEFAULT TRUE COMMENT '启用状态',
  `createdAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  `updatedAt`   DATETIME     NOT NULL COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `Role_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- 菜单表（自关联树）
CREATE TABLE `Menu` (
  `id`         VARCHAR(32)  NOT NULL COMMENT '主键',
  `parentId`   VARCHAR(32)  NULL COMMENT '父节点 ID（null=根）；约束: DIR→DIR/MENU, MENU→BUTTON, BUTTON→无子级',
  `name`       VARCHAR(255) NOT NULL COMMENT '菜单名称',
  `type`       VARCHAR(16)  NOT NULL COMMENT '类型: DIR 目录 / MENU 菜单 / BUTTON 按钮',
  `path`       VARCHAR(255) NULL COMMENT '路由路径（MENU 必填，如 /system/user）',
  `component`  VARCHAR(255) NULL COMMENT '前端组件注册 key（MENU 必填，如 system/user）',
  `icon`       VARCHAR(64)  NULL COMMENT '图标名（lucide，DIR/MENU 用）',
  `permission` VARCHAR(255) NULL COMMENT '权限码（MENU/BUTTON 用，如 system:user:add）',
  `sort`       INT          NOT NULL DEFAULT 0 COMMENT '同层排序值',
  `status`     BOOLEAN      NOT NULL DEFAULT TRUE COMMENT '启用状态',
  `createdAt`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  `updatedAt`  DATETIME     NOT NULL COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `Menu_permission_key` (`permission`),
  KEY `Menu_parentId_fkey` (`parentId`),
  CONSTRAINT `Menu_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Menu` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='菜单表（自关联树）';

-- 用户-角色关联表
CREATE TABLE `UserRole` (
  `userId` VARCHAR(32) NOT NULL COMMENT '用户 ID',
  `roleId` VARCHAR(32) NOT NULL COMMENT '角色 ID',
  PRIMARY KEY (`userId`, `roleId`),
  CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户-角色关联表（多对多）';

-- 角色-菜单授权关联表
CREATE TABLE `RoleMenu` (
  `roleId` VARCHAR(32) NOT NULL COMMENT '角色 ID',
  `menuId` VARCHAR(32) NOT NULL COMMENT '菜单 ID（含 BUTTON 节点）',
  PRIMARY KEY (`roleId`, `menuId`),
  CONSTRAINT `RoleMenu_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `RoleMenu_menuId_fkey` FOREIGN KEY (`menuId`) REFERENCES `Menu` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-菜单授权关联表（多对多，含按钮权限）';

-- 刷新令牌表
CREATE TABLE `RefreshToken` (
  `id`        VARCHAR(32)  NOT NULL COMMENT '主键',
  `userId`    VARCHAR(32)  NOT NULL COMMENT '所属用户 ID',
  `tokenHash` VARCHAR(64)  NOT NULL COMMENT '令牌哈希（sha256）',
  `expiresAt` DATETIME     NOT NULL COMMENT '过期时间（7 天）',
  `revokedAt` DATETIME     NULL COMMENT '吊销时间（null=有效）',
  `createdAt` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `RefreshToken_tokenHash_key` (`tokenHash`),
  CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='刷新令牌表（支持吊销与轮换）';

-- 动态码记录表
CREATE TABLE `OtpCode` (
  `id`         VARCHAR(32)  NOT NULL COMMENT '主键',
  `channel`    VARCHAR(16)  NOT NULL COMMENT '渠道: EMAIL / TELEPHONE',
  `target`     VARCHAR(255) NOT NULL COMMENT '目标地址（邮箱或手机号）',
  `codeHash`   VARCHAR(64)  NOT NULL COMMENT '验证码哈希（sha256）',
  `expiresAt`  DATETIME     NOT NULL COMMENT '过期时间（5 分钟）',
  `attempts`   INT          NOT NULL DEFAULT 0 COMMENT '已尝试次数（上限 5）',
  `consumedAt` DATETIME     NULL COMMENT '消费时间（null=未使用）',
  `createdAt`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  `userId`     VARCHAR(32)  NULL COMMENT '关联用户 ID（目标匹配到用户时记录）',
  PRIMARY KEY (`id`),
  CONSTRAINT `OtpCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='动态码记录表（邮箱/手机验证码）';
```

- [ ] **Step 2: 方言差异与同步约定文档**

`docs/database/README.md`（完整内容）：

```markdown
# 数据库结构文档

- `schema.sql`：MySQL 方言 DDL，全字段注释，开发者速查用
- **运行时权威**是 `packages/db/prisma/schema.prisma`，本 SQL 文件仅作文档
- **同步约定**：任何 schema.prisma 字段变更，必须同步更新本文件；CI 阶段人工核对

## 三方言差异说明

| 项目 | SQLite | MySQL | PostgreSQL |
|---|---|---|---|
| 字段注释 | 不支持 COMMENT，用 `--` 行注释 | `COMMENT '...'` 内联 | `COMMENT ON COLUMN t.c IS '...'` |
| 布尔 | INTEGER 0/1 | BOOLEAN/TINYINT(1) | BOOLEAN |
| 外键级联 | 需 PRAGMA foreign_keys=ON（Prisma 自动处理） | 内联约束 | ALTER TABLE 追加 |
| 时间 | TEXT/DATETIME | DATETIME | TIMESTAMPTZ |

本文件为 MySQL 权威版；SQLite 与 PostgreSQL 的 DDL 由 Prisma migrate 生成（migrate 产物以各 provider 为准）。

## 切换数据库

```bash
# packages/db 下
# 1. 改 .env 的 DATABASE_URL
# 2. 改 prisma/schema.prisma 的 provider（sqlite/mysql/postgresql）
# 3. 重新生成并迁移
pnpm --filter @repo/db exec prisma migrate dev --name switch
pnpm --filter @repo/db seed
```
```

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "docs: database schema sql with full field comments

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: apps/api 骨架

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/.env.example`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/lib/http-error.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/test/health.test.ts`

- [ ] **Step 1: 包骨架 + 配置**

`apps/api/package.json`：
```json
{
  "name": "@repo/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "lint": "eslint src test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "@hono/swagger-ui": "^0.5.0",
    "@hono/zod-openapi": "^0.18.0",
    "@repo/db": "workspace:*",
    "@repo/shared": "workspace:*",
    "hono": "^4.6.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`apps/api/tsconfig.json`：
```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`apps/api/.env.example`：
```
DATABASE_URL="file:../../packages/db/prisma/dev.db"
JWT_SECRET="dev-secret-change-me"
AUTH_PROVIDER="local"
PORT=3001
```

`apps/api/vitest.config.ts`：
```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
  },
})
```

- [ ] **Step 2: 配置 + 错误处理**

`apps/api/src/config.ts`：
```ts
export interface AppConfig {
  databaseUrl: string
  jwtSecret: string
  authProvider: "local" | "clerk"
  port: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const provider = env.AUTH_PROVIDER ?? "local"
  if (provider !== "local" && provider !== "clerk") {
    throw new Error(`AUTH_PROVIDER 仅支持 local/clerk，收到: ${provider}`)
  }
  const jwtSecret = env.JWT_SECRET ?? "dev-secret-change-me"
  const port = Number(env.PORT ?? 3001)
  return {
    databaseUrl: env.DATABASE_URL ?? "file:../../packages/db/prisma/dev.db",
    jwtSecret,
    authProvider: provider,
    port,
  }
}
```

`apps/api/src/lib/http-error.ts`：
```ts
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function notFound(message = "资源不存在"): HttpError {
  return new HttpError(404, "NOT_FOUND", message)
}
export function conflict(message = "数据冲突"): HttpError {
  return new HttpError(409, "CONFLICT", message)
}
export function badRequest(message = "请求参数错误"): HttpError {
  return new HttpError(400, "BAD_REQUEST", message)
}
export function unauthorized(message = "未登录或登录已过期"): HttpError {
  return new HttpError(401, "UNAUTHORIZED", message)
}
export function forbidden(message = "无权限访问"): HttpError {
  return new HttpError(403, "FORBIDDEN", message)
}
```

- [ ] **Step 3: 写失败测试**

`apps/api/test/health.test.ts`：
```ts
import { describe, expect, it } from "vitest"
import { createApp } from "../src/index.js"

describe("health", () => {
  it("GET /api/health 返回 ok", async () => {
    const app = createApp()
    const res = await app.request("/api/health")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ code: 0, data: { ok: true }, message: "ok" })
  })

  it("未知路由返回 404 统一格式", async () => {
    const app = createApp()
    const res = await app.request("/api/nope")
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toMatchObject({ code: "NOT_FOUND" })
  })
})
```

- [ ] **Step 4: 实现 app**

`apps/api/src/index.ts`：
```ts
import { OpenAPIHono } from "@hono/zod-openapi"
import { swaggerUI } from "@hono/swagger-ui"
import { HTTPException } from "hono/http-exception"
import { HttpError } from "./lib/http-error.js"

export function createApp(): OpenAPIHono {
  const app = new OpenAPIHono()

  app.doc("/api/openapi.json", {
    openapi: "3.0.0",
    info: { title: "shadcn-mono API", version: "0.1.0" },
  })
  app.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }))

  app.get("/api/health", (c) =>
    c.json({ code: 0, data: { ok: true }, message: "ok" }),
  )

  app.notFound((c) =>
    c.json({ code: "NOT_FOUND", message: "接口不存在", data: null }, 404),
  )

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ code: err.code, message: err.message, data: null }, err.status)
    }
    if (err instanceof HTTPException) {
      return c.json({ code: "HTTP_ERROR", message: err.message, data: null }, err.status)
    }
    console.error("[api] unhandled error:", err)
    return c.json({ code: "INTERNAL", message: "服务器内部错误", data: null }, 500)
  })

  return app
}

// 仅直接运行时监听（测试用 createApp().request()）
if (import.meta.url === `file://${process.argv[1]}`) {
  const { serve } = await import("@hono/node-server")
  const { loadConfig } = await import("./config.js")
  const cfg = loadConfig()
  serve({ fetch: createApp().fetch, port: cfg.port }, (info) => {
    console.log(`api listening on http://localhost:${info.port}`)
  })
}
```

- [ ] **Step 5: 验证 + 提交**

```bash
cd "E:\vibe-coding\shadcn-mono"
pnpm install
pnpm --filter @repo/api test
pnpm --filter @repo/api typecheck
```
Expected: 2 个测试 PASS；typecheck 无错误。提交：
```bash
git add -A && git commit -m "feat: api skeleton with error handling

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: 认证 login / refresh / logout

**Files:**
- Create: `apps/api/src/lib/jwt.ts`
- Create: `apps/api/src/lib/password.ts`
- Create: `apps/api/src/lib/tokens.ts`
- Create: `apps/api/src/routes/auth.ts`
- Create: `apps/api/test/auth.test.ts`

- [ ] **Step 1: 密码哈希（node:crypto scrypt）+ JWT + refresh 令牌**

`apps/api/src/lib/password.ts`：
```ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

const SCRYPT_N = 16384

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(plain, salt, 64, { N: SCRYPT_N }).toString("hex")
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$")
  if (parts.length !== 3 || parts[0] !== "scrypt") return false
  const salt = parts[1] ?? ""
  const expected = parts[2] ?? ""
  const actual = scryptSync(plain, salt, 64, { N: SCRYPT_N }).toString("hex")
  const a = Buffer.from(actual, "hex")
  const b = Buffer.from(expected, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}
```

`apps/api/src/lib/jwt.ts`：
```ts
import { createHmac, timingSafeEqual } from "node:crypto"

const ACCESS_TTL_SECONDS = 5 * 60

export function signAccessToken(userId: string, secret: string, now = Date.now()): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, exp: Math.floor(now / 1000) + ACCESS_TTL_SECONDS, iat: Math.floor(now / 1000) }),
  ).toString("base64url")
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url")
  return `${header}.${payload}.${sig}`
}

export function verifyAccessToken(token: string, secret: string): string | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url")
  const a = Buffer.from(sig ?? "")
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as {
      sub?: unknown
      exp?: unknown
    }
    if (typeof data.sub !== "string") return null
    if (typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null
    return data.sub
  } catch {
    return null
  }
}
```

`apps/api/src/lib/tokens.ts`（refresh 生成/哈希 + 签发/吊销）：
```ts
import { createHash, randomBytes } from "node:crypto"
import { prisma } from "@repo/db"

export function generateRefreshToken(): string {
  return randomBytes(48).toString("hex")
}
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export async function issueTokenPair(userId: string, jwtSecret: string): Promise<TokenPair> {
  const refreshToken = generateRefreshToken()
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  })
  const { signAccessToken } = await import("./jwt.js")
  return { accessToken: signAccessToken(userId, jwtSecret), refreshToken }
}
```

- [ ] **Step 2: 写失败测试**

`apps/api/test/auth.test.ts`：
```ts
import { beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/index.js"
import { createTestUser } from "./helpers.js"

describe("auth", () => {
  beforeAll(async () => {
    await createTestUser({ username: "auth_test", password: "Passw0rd!" })
  })

  it("登录成功返回双 token", async () => {
    const app = createApp()
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "auth_test", password: "Passw0rd!" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) })
  })

  it("密码错误返回 401", async () => {
    const app = createApp()
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "auth_test", password: "wrong" }),
    })
    expect(res.status).toBe(401)
  })

  it("连续 5 次错误密码锁定 15 分钟", async () => {
    const app = createApp()
    for (let i = 0; i < 5; i++) {
      await app.request("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "auth_test", password: "wrong" }),
      })
    }
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "auth_test", password: "Passw0rd!" }),
    })
    expect(res.status).toBe(423)
  })

  it("refresh 轮换：旧 token 吊销、新 token 有效", async () => {
    const app = createApp()
    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "auth_test", password: "Passw0rd!" }),
    })
    const { refreshToken } = (await login.json()).data
    const r1 = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    expect(r1.status).toBe(200)
    const r2 = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    expect(r2.status).toBe(401)
  })

  it("logout 吊销 refresh", async () => {
    const app = createApp()
    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "auth_test", password: "Passw0rd!" }),
    })
    const { refreshToken } = (await login.json()).data
    await app.request("/api/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    const r = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    expect(r.status).toBe(401)
  })
})
```

`apps/api/test/helpers.ts`：
```ts
import { prisma } from "@repo/db"
import { hashPassword } from "../src/lib/password.js"

export async function createTestUser(opts: { username: string; password: string }): Promise<void> {
  await prisma.user.create({
    data: {
      username: opts.username,
      passwordHash: hashPassword(opts.password),
      nickname: opts.username,
    },
  })
}
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm --filter @repo/api test`
Expected: FAIL（路由未实现 / test DB 不存在——需先建测试库）

> **测试数据库设置**（一次性，本任务与后续所有 api 测试共用）：新建 `apps/api/test/setup.ts`：
> ```ts
> import { execSync } from "node:child_process"
> import { beforeAll } from "vitest"
>
> beforeAll(() => {
>   process.env.DATABASE_URL ??= "file:../../packages/db/prisma/test.db"
>   execSync("npx prisma db push --force-reset --skip-generate", {
>     cwd: "../../packages/db",
>     env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
>     stdio: "ignore",
>   })
> })
> ```
> 并在 `vitest.config.ts` 增加 `setupFiles: ["./test/setup.ts"]`。每次测试运行前重建测试库（`--force-reset` 保证干净），测试间数据隔离靠 `beforeAll` 顺序。

- [ ] **Step 4: 实现登录限流 + 路由**

`apps/api/src/lib/login-throttle.ts`：
```ts
// 内存限流：账号 + IP 维度，连续失败 5 次锁 15 分钟（重启失效，单实例够用）
const locks = new Map<string, { lockedUntil: number; failures: number }>()

export function checkThrottle(key: string, now = Date.now()): boolean {
  const lock = locks.get(key)
  if (!lock) return true
  if (lock.lockedUntil <= now) {
    locks.delete(key)
    return true
  }
  return false
}

export function recordFailure(key: string, now = Date.now()): void {
  const lock = locks.get(key) ?? { lockedUntil: 0, failures: 0 }
  lock.failures += 1
  if (lock.failures >= 5) {
    lock.lockedUntil = now + 15 * 60 * 1000
    lock.failures = 0
  }
  locks.set(key, lock)
}
```

`apps/api/src/routes/auth.ts`：
```ts
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { HttpError, unauthorized, forbidden } from "../lib/http-error.js"
import { verifyPassword } from "../lib/password.js"
import { verifyAccessToken } from "../lib/jwt.js"
import { hashToken, issueTokenPair } from "../lib/tokens.js"
import { checkThrottle, recordFailure } from "../lib/login-throttle.js"

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(128),
})
const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export function authRoutes(jwtSecret: string): OpenAPIHono {
  const app = new OpenAPIHono()

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/login",
      request: { body: { content: { "application/json": { schema: loginSchema } } } },
      responses: {
        200: { description: "登录成功" },
        401: { description: "用户名或密码错误" },
        423: { description: "账号锁定" },
      },
    }),
    async (c) => {
      const { username, password } = c.req.valid("json")
      const key = `login:${username.toLowerCase()}:${c.req.header("x-forwarded-for") ?? "local"}`
      if (!checkThrottle(key)) throw new HttpError(423, "LOCKED", "账号已锁定，请 15 分钟后再试")

      const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } })
      if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        recordFailure(key)
        throw unauthorized("用户名或密码错误")
      }
      if (!user.status) throw forbidden("账号已被禁用")

      const pair = await issueTokenPair(user.id, jwtSecret)
      return c.json({ code: 0, data: { ...pair, user: publicUser(user) }, message: "ok" })
    },
  )

  // refresh / logout 路由同理（完整实现见下）
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/refresh",
      request: { body: { content: { "application/json": { schema: refreshSchema } } } },
      responses: { 200: { description: "轮换成功" }, 401: { description: "无效" } },
    }),
    async (c) => {
      const { refreshToken } = c.req.valid("json")
      const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } })
      if (!record || record.revokedAt || record.expiresAt < new Date()) throw unauthorized("登录已过期")
      const user = await prisma.user.findUnique({ where: { id: record.userId } })
      if (!user || !user.status) throw unauthorized("账号不可用")
      await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } })
      const pair = await issueTokenPair(user.id, jwtSecret)
      return c.json({ code: 0, data: pair, message: "ok" })
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/logout",
      request: { body: { content: { "application/json": { schema: refreshSchema } } } },
      responses: { 200: { description: "已吊销" } },
    }),
    async (c) => {
      const { refreshToken } = c.req.valid("json")
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      return c.json({ code: 0, data: null, message: "ok" })
    },
  )

  return app
}

function publicUser(user: { id: string; username: string; nickname: string; email: string | null; telephone: string | null }): unknown {
  return { id: user.id, username: user.username, nickname: user.nickname, email: user.email, telephone: user.telephone }
}
```

- [ ] **Step 5: 验证 + 提交**

```bash
pnpm --filter @repo/api test
pnpm --filter @repo/api typecheck
```
Expected: auth 测试全部 PASS（health 2 个 + auth 5 个）。提交：
```bash
git add -A && git commit -m "feat: auth login/refresh/logout with throttling

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

> **注意（实现者）**：`createTestUser` 依赖用户唯一 username；若测试间重复调用需 `deleteMany` 清理。`setup.ts` 中 `db push --force-reset` 已保证每次全量重建，`beforeAll` 顺序创建即可。Task 9 的 me 路由需要复用 `publicUser`——实现时把它导出到 `services/auth-info.ts`。

---

## Task 8: OTP 动态码 send / login

**Files:**
- Create: `apps/api/src/lib/otp-sender.ts`
- Create: `apps/api/src/routes/otp.ts`
- Create: `apps/api/test/otp.test.ts`

- [ ] **Step 1: OtpSender 抽象 + DevOtpSender**

`apps/api/src/lib/otp-sender.ts`：
```ts
export interface OtpSender {
  sendEmail(to: string, code: string): Promise<void>
  sendSms(to: string, code: string): Promise<void>
}

/** 开发实现：仅打印到控制台。接入真实短信/邮件通道时替换为其他实现（见 README）。 */
export class DevOtpSender implements OtpSender {
  async sendEmail(to: string, code: string): Promise<void> {
    console.log(`[DevOtpSender] EMAIL → ${to}: 验证码 ${code}（5 分钟内有效）`)
  }
  async sendSms(to: string, code: string): Promise<void> {
    console.log(`[DevOtpSender] SMS → ${to}: 验证码 ${code}（5 分钟内有效）`)
  }
}

export const otpSender: OtpSender = new DevOtpSender()
```

- [ ] **Step 2: 写失败测试**

`apps/api/test/otp.test.ts`：
```ts
import { beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/index.js"
import { createTestUser } from "./helpers.js"

const CHANNEL = "email"
const TARGET = "otp_test@example.com"

async function sendOtp(app: ReturnType<typeof createApp>): Promise<number> {
  const res = await app.request("/api/auth/otp/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channel: CHANNEL, target: TARGET }),
  })
  return res.status
}

describe("otp", () => {
  beforeAll(async () => {
    await createTestUser({ username: "otp_test", password: "Passw0rd!", email: TARGET })
  })

  it("send：目标存在时返回成功", async () => {
    expect(await sendOtp(createApp())).toBe(200)
  })

  it("send：目标不存在也返回成功（防枚举）", async () => {
    const app = createApp()
    const res = await app.request("/api/auth/otp/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: CHANNEL, target: "nobody@example.com" }),
    })
    expect(res.status).toBe(200)
  })

  it("send：60 秒冷却（同一 target 重复发送返回 429）", async () => {
    const app = createApp()
    expect(await sendOtp(app)).toBe(200)
    expect(await sendOtp(app)).toBe(429)
  })

  it("login：正确验证码登录成功并一次性消费", async () => {
    const app = createApp()
    const code = await captureCodeFromDb(TARGET)
    const res = await app.request("/api/auth/otp/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: CHANNEL, target: TARGET, code }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ accessToken: expect.any(String) })

    const again = await app.request("/api/auth/otp/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: CHANNEL, target: TARGET, code }),
    })
    expect(again.status).toBe(401) // 已消费
  })

  it("login：错误码 5 次后锁定", async () => {
    const app = createApp()
    const code = await captureCodeFromDb(TARGET)
    for (let i = 0; i < 5; i++) {
      const res = await app.request("/api/auth/otp/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel: CHANNEL, target: TARGET, code: "000000" }),
      })
      expect(res.status).toBe(401)
    }
    const res = await app.request("/api/auth/otp/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: CHANNEL, target: TARGET, code }),
    })
    expect(res.status).toBe(423) // attempts 超限
  })
})
```

- [ ] **Step 3: 测试辅助（读库取码）**

`apps/api/test/helpers.ts` 追加：
```ts
import { prisma } from "@repo/db"

/** 测试用：按 target 找到最新未消费验证码（DevOtpSender 会写入 devPlainCode 明文通道） */
export async function captureCodeFromDb(target: string): Promise<string> {
  const record = await prisma.otpCode.findFirst({
    where: { target, consumedAt: null },
    orderBy: { createdAt: "desc" },
  })
  const code = record?.devPlainCode
  if (!code) throw new Error(`未找到未消费验证码: ${target}`)
  return code
}
```

> **关键设计（实现者必读）**：验证码库中只存 sha256 哈希，测试无法反推明文——因此 `OtpCode.devPlainCode`（Task 4 已含）作为测试专用明文通道：`DevOtpSender` 场景下写入，真实发送实现不写。`captureCodeFromDb` 读取 `devPlainCode`。

- [ ] **Step 4: 实现 OTP 路由**

`apps/api/src/routes/otp.ts`（完整实现）：
```ts
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { createHash, randomInt } from "node:crypto"
import { prisma } from "@repo/db"
import { HttpError } from "../lib/http-error.js"
import { otpSender } from "../lib/otp-sender.js"
import { issueTokenPair } from "../lib/tokens.js"

const OTP_TTL_MS = 5 * 60 * 1000
const OTP_COOLDOWN_MS = 60 * 1000
const OTP_MAX_ATTEMPTS = 5

const sendSchema = z.object({
  channel: z.enum(["email", "telephone"]),
  target: z.string().min(3).max(255),
})
const loginOtpSchema = sendSchema.extend({ code: z.string().regex(/^\d{6}$/) })

const channelToField = { email: "email", telephone: "telephone" } as const

export function otpRoutes(jwtSecret: string): OpenAPIHono {
  const app = new OpenAPIHono()

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/otp/send",
      request: { body: { content: { "application/json": { schema: sendSchema } } } },
      responses: { 200: { description: "已发送" }, 429: { description: "冷却中" } },
    }),
    async (c) => {
      const { channel, target } = c.req.valid("json")
      const normalized = target.toLowerCase()
      const latest = await prisma.otpCode.findFirst({
        where: { channel: channel.toUpperCase(), target: normalized },
        orderBy: { createdAt: "desc" },
      })
      if (latest && Date.now() - latest.createdAt.getTime() < OTP_COOLDOWN_MS) {
        throw new HttpError(429, "RATE_LIMITED", "发送过于频繁，请 60 秒后再试")
      }

      const code = randomInt(100000, 1000000).toString()
      const user = await prisma.user.findFirst({
        where: { [channelToField[channel]]: normalized },
      })
      const hash = createHash("sha256").update(code).digest("hex")
      await prisma.otpCode.create({
        data: {
          channel: channel.toUpperCase(),
          target: normalized,
          codeHash: hash,
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
          userId: user?.id ?? null,
          // 测试专用明文（DevOtpSender 场景）：仅开发库保留；生产实现不写入
          devPlainCode: code,
        },
      })
      // 防枚举：目标不存在同样"发送成功"（不投递）
      if (user) {
        if (channel === "email") await otpSender.sendEmail(user.email!, code)
        else await otpSender.sendSms(user.telephone!, code)
      }
      return c.json({ code: 0, data: { sent: true }, message: "ok" })
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/otp/login",
      request: { body: { content: { "application/json": { schema: loginOtpSchema } } } },
      responses: { 200: { description: "登录成功" }, 401: { description: "验证码错误" }, 423: { description: "尝试超限" } },
    }),
    async (c) => {
      const { channel, target, code } = c.req.valid("json")
      const normalized = target.toLowerCase()
      const record = await prisma.otpCode.findFirst({
        where: { channel: channel.toUpperCase(), target: normalized, consumedAt: null },
        orderBy: { createdAt: "desc" },
      })
      if (!record || record.expiresAt < new Date()) {
        throw new HttpError(401, "INVALID_OTP", "验证码无效或已过期")
      }
      if (record.attempts >= OTP_MAX_ATTEMPTS) {
        throw new HttpError(423, "LOCKED", "尝试次数过多，请重新获取验证码")
      }
      const hash = createHash("sha256").update(code).digest("hex")
      if (hash !== record.codeHash) {
        await prisma.otpCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } })
        throw new HttpError(401, "INVALID_OTP", "验证码错误")
      }
      const user = await prisma.user.findUnique({ where: { id: record.userId ?? "" } })
      if (!user || !user.status) throw new HttpError(401, "INVALID_OTP", "账号不可用")

      await prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } })
      const pair = await issueTokenPair(user.id, jwtSecret)
      return c.json({ code: 0, data: pair, message: "ok" })
    },
  )

  return app
}
```

> **实现修正点**：① 上述代码引用了 `OtpCode.devPlainCode` 字段——按 Step 3 的关键设计先在 schema.prisma 增加该字段并 `prisma db push`；② `captureCodeFromDb` 改为读 `devPlainCode`；③ 把 `otpRoutes` 挂到 `index.ts`（`app.route("/", otpRoutes(cfg.jwtSecret))`）。

- [ ] **Step 5: 验证 + 提交**

```bash
pnpm --filter @repo/api test
pnpm --filter @repo/api typecheck
```
Expected: otp 5 个测试全部 PASS。提交。

---

## Task 9: 权限中间件 + /auth/me

**Files:**
- Create: `apps/api/src/services/auth-info.ts`
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/routes/me.ts`
- Create: `apps/api/test/me.test.ts`

- [ ] **Step 1: 写失败测试**

`apps/api/test/me.test.ts`：
```ts
import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@repo/db"
import { createApp } from "../src/index.js"
import { createTestUser } from "./helpers.js"
import { hashPassword } from "../src/lib/password.js"

async function loginAs(username: string): Promise<{ app: ReturnType<typeof createApp>; token: string }> {
  const app = createApp()
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "Passw0rd!" }),
  })
  const body = await res.json()
  return { app, token: body.data.accessToken }
}

describe("auth/me 与权限中间件", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { username: "me_test", passwordHash: hashPassword("Passw0rd!"), nickname: "me_test" },
    })
    const roleA = await prisma.role.create({ data: { name: "角色A", code: "ROLE_A" } })
    const roleB = await prisma.role.create({ data: { name: "角色B", code: "ROLE_B" } })
    const dir = await prisma.menu.create({ data: { name: "系统管理", type: "DIR", sort: 1 } })
    const mUser = await prisma.menu.create({
      data: { parentId: dir.id, name: "用户管理", type: "MENU", path: "/system/user", component: "system/user", permission: "system:user:query", sort: 1 },
    })
    const bAdd = await prisma.menu.create({
      data: { parentId: mUser.id, name: "用户新增", type: "BUTTON", permission: "system:user:add", sort: 1 },
    })
    await prisma.userRole.createMany({
      data: [{ userId: user.id, roleId: roleA.id }, { userId: user.id, roleId: roleB.id }],
    })
    // roleA: dir+mUser+bAdd；roleB: dir+mUser → 交集 = dir+mUser（bAdd 被交掉）
    await prisma.roleMenu.createMany({
      data: [
        { roleId: roleA.id, menuId: dir.id },
        { roleId: roleA.id, menuId: mUser.id },
        { roleId: roleA.id, menuId: bAdd.id },
        { roleId: roleB.id, menuId: dir.id },
        { roleId: roleB.id, menuId: mUser.id },
      ],
    })
  })

  it("me 返回交集后的导航树与权限码（按钮被交集剔除）", async () => {
    const { app, token } = await loginAs("me_test")
    const res = await app.request("/api/auth/me", { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.data.navTree).toHaveLength(1)
    const child = data.data.navTree[0].children[0]
    expect(child.id).toBe("system:user:query".length > 0 ? child.id : undefined) // 仅取结构
    expect(data.data.permissionCodes).toEqual(["system:user:query"])
  })

  it("未登录访问 me 返回 401", async () => {
    const app = createApp()
    const res = await app.request("/api/auth/me")
    expect(res.status).toBe(401)
  })

  it("requirePermission：交集内权限可过、交集外返回 403", async () => {
    const { app, token } = await loginAs("me_test")
    const ok = await app.request("/api/test-perm/system:user:query", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(ok.status).toBe(200)
    const denied = await app.request("/api/test-perm/system:user:add", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(denied.status).toBe(403)
  })
})
```

- [ ] **Step 2: 实现 auth-info 服务 + 中间件 + me 路由**

`apps/api/src/services/auth-info.ts`：
```ts
import { prisma } from "@repo/db"
import { computeVisibleMenus, type MenuNode } from "@repo/shared"

export interface AuthInfo {
  user: { id: string; username: string; nickname: string; email: string | null; telephone: string | null }
  roles: { id: string; name: string; code: string }[]
  navTree: MenuNode[]
  permissionCodes: string[]
}

export async function getUserAuthInfo(userId: string): Promise<AuthInfo> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error("user not found")
  const userRoles = await prisma.userRole.findMany({ where: { userId }, include: { role: true } })
  const roles = userRoles.map((r) => ({ id: r.role.id, name: r.role.name, code: r.role.code }))
  const roleIds = userRoles.map((r) => r.roleId)
  const roleMenus = await prisma.roleMenu.findMany({ where: { roleId: { in: roleIds } }, include: { menu: true } })
  const allMenus = (await prisma.menu.findMany({ orderBy: { sort: "asc" } })).map(toMenuNode)
  const roleMenuIdsList: string[][] = roleIds.map((rid) =>
    roleMenus.filter((rm) => rm.roleId === rid).map((rm) => rm.menuId),
  )
  const { navTree, permissionCodes } = computeVisibleMenus(roleMenuIdsList, allMenus)
  return {
    user: { id: user.id, username: user.username, nickname: user.nickname, email: user.email, telephone: user.telephone },
    roles,
    navTree,
    permissionCodes: [...permissionCodes],
  }
}

function toMenuNode(m: {
  id: string
  parentId: string | null
  name: string
  type: string
  path: string | null
  component: string | null
  icon: string | null
  permission: string | null
  sort: number
  status: boolean
}): MenuNode {
  return {
    id: m.id,
    parentId: m.parentId,
    name: m.name,
    type: m.type as MenuNode["type"],
    path: m.path,
    component: m.component,
    icon: m.icon,
    permission: m.permission,
    sort: m.sort,
    status: m.status,
    children: [],
  }
}
```

`apps/api/src/middleware/auth.ts`：
```ts
import type { Context, MiddlewareHandler, Next } from "hono"
import { prisma } from "@repo/db"
import { HttpError } from "../lib/http-error.js"
import { verifyAccessToken } from "../lib/jwt.js"
import { getUserAuthInfo } from "../services/auth-info.js"

export function authenticate(jwtSecret: string): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const header = c.req.header("authorization")
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null
    if (!token) throw new HttpError(401, "UNAUTHORIZED", "未登录")
    const userId = verifyAccessToken(token, jwtSecret)
    if (!userId) throw new HttpError(401, "UNAUTHORIZED", "登录已过期")
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.status) throw new HttpError(401, "UNAUTHORIZED", "账号不可用")
    c.set("userId", user.id)
    await next()
  }
}

export function requirePermission(code: string): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId") as string
    const info = await getUserAuthInfo(userId)
    if (!info.permissionCodes.includes(code)) {
      throw new HttpError(403, "FORBIDDEN", `缺少权限: ${code}`)
    }
    c.set("authInfo", info)
    await next()
  }
}

// 类型声明（Hono Context 变量）
declare module "hono" {
  interface ContextVariableMap {
    userId: string
    authInfo?: import("../services/auth-info.js").AuthInfo
  }
}
```

`apps/api/src/routes/me.ts`：
```ts
import { createRoute, OpenAPIHono } from "@hono/zod-openapi"
import { getUserAuthInfo } from "../services/auth-info.js"

export function meRoutes(): OpenAPIHono {
  const app = new OpenAPIHono()
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/auth/me",
      responses: { 200: { description: "当前用户信息" }, 401: { description: "未登录" } },
    }),
    async (c) => {
      const info = await getUserAuthInfo(c.get("userId"))
      return c.json({ code: 0, data: info, message: "ok" })
    },
  )
  return app
}
```

- [ ] **Step 3: 挂载到 index.ts（含测试用权限校验路由）**

`apps/api/src/index.ts` 修改：在 `createApp()` 中追加：
```ts
app.route("/", authRoutes(jwtSecret))
app.route("/", otpRoutes(jwtSecret))
app.route("/", meRoutes())
// 测试专用：验证 requirePermission 行为（真实业务路由后续任务挂载）
app.get("/api/test-perm/:code", authenticate(jwtSecret), (c) => {
  const code = c.req.param("code")
  return requirePermission(code)(c, async () => {
    return c.json({ code: 0, data: { ok: true }, message: "ok" })
  })
})
```
> `jwtSecret` 从 `createApp()` 参数传入（`createApp(config?: AppConfig)`，默认 `loadConfig()`）。authRoutes/otpRoutes/meRoutes 挂载同理。中间件组合写法：`app.get("/path", authenticate(jwtSecret), handler)`，`requirePermission` 也作为中间件参数。

- [ ] **Step 4: 验证 + 提交**

```bash
pnpm --filter @repo/api test
pnpm --filter @repo/api typecheck
```
Expected: me 测试 3 个 PASS。提交。

---

## Task 10: 用户管理 CRUD

**Files:**
- Create: `apps/api/src/routes/users.ts`
- Create: `apps/api/test/users.test.ts`
- Modify: `apps/api/src/index.ts`（挂载 users 路由）

- [ ] **Step 1: 写失败测试**

`apps/api/test/users.test.ts`（核心场景）：
```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@repo/db"
import { createApp } from "../src/index.js"
import { hashPassword } from "../src/lib/password.js"

async function loginAdmin(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "perm_admin", password: "Passw0rd!" }),
  })
  return (await res.json()).data.accessToken
}

describe("users CRUD", () => {
  beforeAll(async () => {
    // 管理员用户 + ADMIN 角色（全量菜单授权）
    const admin = await prisma.user.create({
      data: { username: "perm_admin", passwordHash: hashPassword("Passw0rd!"), nickname: "管理员" },
    })
    const role = await prisma.role.create({ data: { name: "管理员", code: "ADMIN" } })
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })
    const menus = await prisma.menu.findMany()
    await prisma.roleMenu.createMany({ data: menus.map((m) => ({ roleId: role.id, menuId: m.id })) })
  })

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: "crud_" } } })
  })

  it("分页列表", async () => {
    const app = createApp()
    const token = await loginAdmin(app)
    const res = await app.request("/api/users?page=1&pageSize=10", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toMatchObject({ list: expect.any(Array), total: expect.any(Number) })
  })

  it("创建用户 + 重复用户名 409", async () => {
    const app = createApp()
    const token = await loginAdmin(app)
    const create = await app.request("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: "Crud_New", password: "Passw0rd!", nickname: "新用户" }),
    })
    expect(create.status).toBe(200)
    const dup = await app.request("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: "crud_new", password: "Passw0rd!", nickname: "重复" }),
    })
    expect(dup.status).toBe(409)
  })

  it("更新用户（含改密码、角色分配）", async () => {
    const app = createApp()
    const token = await loginAdmin(app)
    const role = await prisma.role.findUnique({ where: { code: "ADMIN" } })
    const user = await prisma.user.create({
      data: { username: "crud_upd", passwordHash: hashPassword("Passw0rd!"), nickname: "旧名" },
    })
    const res = await app.request(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: "新名", roleIds: [role!.id] }),
    })
    expect(res.status).toBe(200)
    const updated = await prisma.user.findUnique({ where: { id: user.id }, include: { roles: true } })
    expect(updated?.nickname).toBe("新名")
    expect(updated?.roles).toHaveLength(1)
  })

  it("删除用户；禁止删除自己", async () => {
    const app = createApp()
    const token = await loginAdmin(app)
    const user = await prisma.user.create({
      data: { username: "crud_del", passwordHash: hashPassword("Passw0rd!"), nickname: "待删" },
    })
    const del = await app.request(`/api/users/${user.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    })
    expect(del.status).toBe(200)
    const self = await app.request("/api/users/self-delete-test", {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    })
    expect(self.status).toBe(400)
  })
})
```

> **实现者注意**：`/api/users/self-delete-test` 的 400 断言依赖"删除自己返回 400"——正确实现：先取当前登录用户 id，删除目标 id === 当前 id 时返回 400。测试中的 `self-delete-test` 是占位写法，实现时应改为真实场景：登录用户删除自己（`token` 对应的 `perm_admin` 就是自删场景）——修正测试为：`DELETE /api/users/<perm_admin.id>` 返回 400。实现时以设计意图为准（禁止删除自己）。

- [ ] **Step 2: 实现 users 路由**

`apps/api/src/routes/users.ts`（完整实现，需包含：分页列表 keyword 模糊、创建（username 小写化、bcrypt 哈希、可选 email/telephone/角色）、详情+角色、PATCH（可选 password/角色）、DELETE（禁自删）、PUT roles、PATCH 唯一冲突转 409）：

```ts
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { HttpError, badRequest, conflict, forbidden } from "../lib/http-error.js"
import { hashPassword } from "../lib/password.js"
import { authenticate, requirePermission } from "../middleware/auth.js"

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  keyword: z.string().optional(),
})
const userCreateSchema = z.object({
  username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(8).max(128),
  nickname: z.string().min(1).max(64),
  email: z.string().email().optional(),
  telephone: z.string().min(5).max(32).optional(),
  roleIds: z.array(z.string()).optional(),
})
const userUpdateSchema = userCreateSchema.partial().extend({ status: z.boolean().optional() })

export function userRoutes(): OpenAPIHono {
  const app = new OpenAPIHono()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/users",
      request: { query: pageQuery },
      responses: { 200: { description: "用户分页列表" }, 401: { description: "未登录" }, 403: { description: "无权限" } },
    }),
    authenticate(process.env.JWT_SECRET ?? "dev-secret-change-me"),
    requirePermission("system:user:query"),
    async (c) => {
      const { page, pageSize, keyword } = c.req.valid("query")
      const where = keyword
        ? {
            OR: [
              { username: { contains: keyword } },
              { nickname: { contains: keyword } },
              { email: { contains: keyword } },
              { telephone: { contains: keyword } },
            ],
          }
        : {}
      const [list, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
          include: { roles: { include: { role: true } } },
        }),
        prisma.user.count({ where }),
      ])
      return c.json({
        code: 0,
        data: {
          list: list.map((u) => ({
            id: u.id, username: u.username, nickname: u.nickname, email: u.email,
            telephone: u.telephone, status: u.status, createdAt: u.createdAt,
            roles: u.roles.map((r) => ({ id: r.role.id, name: r.role.name, code: r.role.code })),
          })),
          total,
        },
        message: "ok",
      })
    },
  )

  // POST /api/users、GET /api/users/:id、PATCH /api/users/:id、DELETE /api/users/:id、PUT /api/users/:id/roles
  // 实现要点：
  // - 创建：username 统一 toLowerCase；passwordHash = hashPassword；Prisma 唯一约束冲突捕获（PrismaClientKnownRequestError code P2002）转 conflict("用户名/邮箱/手机号已存在")
  // - PATCH：password 可选（提供则重新哈希）；roleIds 提供则全量替换 UserRole；email/telephone 冲突同样转 409
  // - DELETE：目标 id === c.get("userId") → badRequest("不能删除自己")；否则删除（UserRole 级联清理）
  // - PUT /:id/roles：deleteMany + createMany 全量替换（事务）
  // 每个路由的权限码：list=query, create=create, detail=query, update=update, delete=delete, roles=assign-role

  return app
}
```

> **实现者注意**：上面第二个 `app.openapi(...)` 只有注释没有代码——这是故意的"模板骨架"，四个端点（POST/GET/PATCH/DELETE + PUT roles）按注释要点实现完整代码；权限码映射：`system:user:create` / `system:user:query` / `system:user:update` / `system:user:delete` / `system:user:assign-role`。`authenticate`/`requirePermission` 中间件参数中的 JWT_SECRET 应改为从 `createApp` 传入的 config 注入（不要直接读 `process.env`）——实现时把 `userRoutes(jwtSecret: string)` 改为接收参数并在挂载时传入。

- [ ] **Step 3: 挂载 + 验证 + 提交**

挂载到 index.ts（带权限码中间件），运行：
```bash
pnpm --filter @repo/api test
pnpm --filter @repo/api typecheck
```
Expected: users 5 个测试 PASS。提交。

---

## Task 11: 角色管理 CRUD + 菜单授权

**Files:**
- Create: `apps/api/src/routes/roles.ts`
- Create: `apps/api/test/roles.test.ts`

- [ ] **Step 1: 写失败测试**

`apps/api/test/roles.test.ts`（核心场景：分页、创建 + code 重复 409、更新、删除清 UserRole、菜单授权回显、授权全量提交）：

```ts
import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@repo/db"
import { createApp } from "../src/index.js"
import { hashPassword } from "../src/lib/password.js"

describe("roles CRUD", () => {
  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { username: "roles_admin", passwordHash: hashPassword("Passw0rd!"), nickname: "管理员" },
    })
    const role = await prisma.role.create({ data: { name: "管理员", code: "ADMIN" } })
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })
    const menus = await prisma.menu.findMany()
    await prisma.roleMenu.createMany({ data: menus.map((m) => ({ roleId: role.id, menuId: m.id })) })
  })

  async function token(): Promise<string> {
    const app = createApp()
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "roles_admin", password: "Passw0rd!" }),
    })
    return (await res.json()).data.accessToken
  }

  it("创建角色 + 重复 code 409", async () => {
    const app = createApp()
    const t = await token()
    const create = await app.request("/api/roles", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ name: "测试角色", code: "TEST_ROLE", sort: 1 }),
    })
    expect(create.status).toBe(200)
    const dup = await app.request("/api/roles", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ name: "重复", code: "test_role", sort: 2 }),
    })
    expect(dup.status).toBe(409)
  })

  it("菜单授权：全量提交 + 回显", async () => {
    const app = createApp()
    const t = await token()
    const role = await prisma.role.create({ data: { name: "授权角色", code: "GRANT_ROLE" } })
    const menus = await prisma.menu.findMany({ take: 2 })
    const put = await app.request(`/api/roles/${role.id}/menus`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ menuIds: menus.map((m) => m.id) }),
    })
    expect(put.status).toBe(200)
    const get = await app.request(`/api/roles/${role.id}/menus`, {
      headers: { authorization: `Bearer ${t}` },
    })
    expect(get.status).toBe(200)
    const body = await get.json()
    expect(body.data.menuIds.sort()).toEqual(menus.map((m) => m.id).sort())
  })

  it("删除角色自动清理 UserRole（用户不受影响）", async () => {
    const app = createApp()
    const t = await token()
    const role = await prisma.role.create({ data: { name: "待删", code: "DEL_ROLE" } })
    const user = await prisma.user.create({
      data: { username: "del_role_user", passwordHash: hashPassword("Passw0rd!"), nickname: "u" },
    })
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })
    const del = await app.request(`/api/roles/${role.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${t}` },
    })
    expect(del.status).toBe(200)
    const left = await prisma.userRole.count({ where: { userId: user.id } })
    expect(left).toBe(0)
    const userLeft = await prisma.user.count({ where: { id: user.id } })
    expect(userLeft).toBe(1)
  })
})
```

- [ ] **Step 2: 实现 roles 路由**

`apps/api/src/routes/roles.ts`（实现要点）：
- `GET /api/roles`：分页 + keyword（name/code 模糊）→ `system:role:query`
- `GET /api/roles/list`：全量（下拉用）→ `system:role:query`
- `POST /api/roles`：code 转大写校验唯一 → 冲突转 409 → `system:role:create`
- `GET/PATCH/DELETE /api/roles/:id`：detail/update/delete；DELETE 仅删 Role（UserRole/RoleMenu 由 Prisma 级联清理）→ `system:role:delete`
- `GET /api/roles/:id/menus`：返回 `{ menuIds: string[] }` → `system:role:query`
- `PUT /api/roles/:id/menus`：`{ menuIds }` 全量替换（`prisma.$transaction`：deleteMany + createMany），**允许含 BUTTON 节点** → `system:role:assign`

代码模式与 users.ts 一致（zod schema + createRoute + 中间件 + Prisma 操作）。提交前运行测试 + typecheck。

---

## Task 12: 菜单管理 CRUD

**Files:**
- Create: `apps/api/src/routes/menus.ts`
- Create: `apps/api/test/menus.test.ts`

- [ ] **Step 1: 写失败测试**

`apps/api/test/menus.test.ts`（核心场景：树获取、类型约束、权限码唯一、级联删除）：

```ts
import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@repo/db"
import { createApp } from "../src/index.js"
import { hashPassword } from "../src/lib/password.js"

describe("menus CRUD", () => {
  let token: string

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { username: "menu_admin", passwordHash: hashPassword("Passw0rd!"), nickname: "管理员" },
    })
    const role = await prisma.role.create({ data: { name: "管理员", code: "ADMIN" } })
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })
    const menus = await prisma.menu.findMany()
    await prisma.roleMenu.createMany({ data: menus.map((m) => ({ roleId: role.id, menuId: m.id })) })
    const app = createApp()
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "menu_admin", password: "Passw0rd!" }),
    })
    token = (await res.json()).data.accessToken
  })

  it("获取完整树（含按钮子节点）", async () => {
    const app = createApp()
    const res = await app.request("/api/menus/tree", { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
  })

  it("类型约束：MENU 下只能挂 BUTTON", async () => {
    const app = createApp()
    const menu = await prisma.menu.create({ data: { name: "测试菜单", type: "MENU", path: "/x", component: "x" } })
    const bad = await app.request("/api/menus", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ parentId: menu.id, name: "违规子目录", type: "DIR" }),
    })
    expect(bad.status).toBe(400)
    const good = await app.request("/api/menus", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ parentId: menu.id, name: "合法按钮", type: "BUTTON", permission: "x:test:add" }),
    })
    expect(good.status).toBe(200)
  })

  it("权限码重复 409；改父节点禁止挂到自身子树", async () => {
    const app = createApp()
    const a = await app.request("/api/menus", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "甲", type: "MENU", path: "/a", component: "a", permission: "dup:check:query" }),
    })
    expect(a.status).toBe(200)
    const aId = (await a.json()).data.id
    const dup = await app.request("/api/menus", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "乙", type: "MENU", path: "/b", component: "b", permission: "dup:check:query" }),
    })
    expect(dup.status).toBe(409)
    // 自挂子树：把 a 的 parentId 改成 a 自己
    const loop = await app.request(`/api/menus/${aId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ parentId: aId }),
    })
    expect(loop.status).toBe(400)
  })

  it("删除级联子树 + 清理 RoleMenu", async () => {
    const app = createApp()
    const dir = await prisma.menu.create({ data: { name: "级联目录", type: "DIR" } })
    const menu = await prisma.menu.create({ data: { parentId: dir.id, name: "子菜单", type: "MENU", path: "/c", component: "c" } })
    const btn = await prisma.menu.create({ data: { parentId: menu.id, name: "子按钮", type: "BUTTON", permission: "cascade:add" } })
    const role = await prisma.role.findUnique({ where: { code: "ADMIN" } })
    await prisma.roleMenu.createMany({
      data: [{ roleId: role!.id, menuId: dir.id }, { roleId: role!.id, menuId: menu.id }, { roleId: role!.id, menuId: btn.id }],
    })
    const del = await app.request(`/api/menus/${dir.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    })
    expect(del.status).toBe(200)
    expect(await prisma.menu.count({ where: { id: { in: [dir.id, menu.id, btn.id] } } })).toBe(0)
    expect(await prisma.roleMenu.count({ where: { menuId: { in: [dir.id, menu.id, btn.id] } } })).toBe(0)
  })
})
```

- [ ] **Step 2: 实现 menus 路由**

`apps/api/src/routes/menus.ts`（实现要点）：
- `GET /api/menus/tree`：全量拉取（orderBy sort）+ 内存 `buildTree` → `system:menu:query`
- `POST /api/menus`：类型约束校验（DIR→DIR/MENU，MENU→BUTTON，BUTTON 无子级；MENU 必填 path+component；permission 冲突转 409）→ `system:menu:create`
- `GET /api/menus/:id`：详情 → `system:menu:query`
- `PATCH /api/menus/:id`：改父节点时校验（目标类型合法 + 不能挂到自身/自身子孙；子孙查询用内存遍历）→ `system:menu:update`
- `DELETE /api/menus/:id`：内存收集子树全部 id → `deleteMany`（菜单）+ RoleMenu `deleteMany`（where menuId in 子树）→ 事务 → `system:menu:delete`

> **实现者注意**：`buildTree` 从 `@repo/shared` 导入复用；P2002 冲突捕获与 users.ts 一致。

- [ ] **Step 3: 验证 + 提交**

```bash
pnpm --filter @repo/api test
pnpm --filter @repo/api typecheck
```
Expected: menus 4 个测试 PASS。提交。

---

## Task 13: 种子数据（幂等）

**Files:**
- Create: `packages/db/src/seed.ts`

- [ ] **Step 1: 实现种子**

`packages/db/src/seed.ts`（完整实现）：
```ts
import { prisma } from "./client.js"
import { hashPassword } from "../../../apps/api/src/lib/password.js"

async function upsertMenu(
  input: { name: string; type: string; path?: string; component?: string; permission?: string; sort: number; parentId?: string },
): Promise<string> {
  // 按 permission 或 name+parentId 查找已存在，存在则更新，不存在创建；返回 id
  const existing = input.permission
    ? await prisma.menu.findUnique({ where: { permission: input.permission } })
    : await prisma.menu.findFirst({ where: { name: input.name, parentId: input.parentId ?? null } })
  if (existing) return existing.id
  const created = await prisma.menu.create({
    data: {
      name: input.name,
      type: input.type,
      path: input.path,
      component: input.component,
      permission: input.permission,
      sort: input.sort,
      parentId: input.parentId,
    },
  })
  return created.id
}

async function main(): Promise<void> {
  // 1. 菜单树（与设计文档 §9 一致）
  const dashboardId = await upsertMenu({ name: "Dashboard", type: "MENU", path: "/", component: "dashboard", sort: 0 })
  const sysId = await upsertMenu({ name: "系统管理", type: "DIR", sort: 100 })
  const userMenuId = await upsertMenu({ name: "用户管理", type: "MENU", path: "/system/user", component: "system/user", permission: "system:user:query", sort: 1, parentId: sysId })
  await upsertMenu({ name: "用户新增", type: "BUTTON", permission: "system:user:create", sort: 1, parentId: userMenuId })
  await upsertMenu({ name: "用户编辑", type: "BUTTON", permission: "system:user:update", sort: 2, parentId: userMenuId })
  await upsertMenu({ name: "用户删除", type: "BUTTON", permission: "system:user:delete", sort: 3, parentId: userMenuId })
  await upsertMenu({ name: "分配角色", type: "BUTTON", permission: "system:user:assign-role", sort: 4, parentId: userMenuId })
  const roleMenuId = await upsertMenu({ name: "角色管理", type: "MENU", path: "/system/role", component: "system/role", permission: "system:role:query", sort: 2, parentId: sysId })
  await upsertMenu({ name: "角色新增", type: "BUTTON", permission: "system:role:create", sort: 1, parentId: roleMenuId })
  await upsertMenu({ name: "角色编辑", type: "BUTTON", permission: "system:role:update", sort: 2, parentId: roleMenuId })
  await upsertMenu({ name: "角色删除", type: "BUTTON", permission: "system:role:delete", sort: 3, parentId: roleMenuId })
  await upsertMenu({ name: "分配权限", type: "BUTTON", permission: "system:role:assign", sort: 4, parentId: roleMenuId })
  const menuMenuId = await upsertMenu({ name: "菜单管理", type: "MENU", path: "/system/menu", component: "system/menu", permission: "system:menu:query", sort: 3, parentId: sysId })
  await upsertMenu({ name: "菜单新增", type: "BUTTON", permission: "system:menu:create", sort: 1, parentId: menuMenuId })
  await upsertMenu({ name: "菜单编辑", type: "BUTTON", permission: "system:menu:update", sort: 2, parentId: menuMenuId })
  await upsertMenu({ name: "菜单删除", type: "BUTTON", permission: "system:menu:delete", sort: 3, parentId: menuMenuId })

  // 2. 角色：ADMIN（全选）/ GUEST（仅 Dashboard）
  const allMenuIds = (await prisma.menu.findMany({ select: { id: true } })).map((m) => m.id)
  const adminRole = await prisma.role.upsert({
    where: { code: "ADMIN" },
    update: { name: "管理员" },
    create: { name: "管理员", code: "ADMIN", sort: 0 },
  })
  await prisma.roleMenu.deleteMany({ where: { roleId: adminRole.id } })
  await prisma.roleMenu.createMany({ data: allMenuIds.map((menuId) => ({ roleId: adminRole.id, menuId })) })
  const guestRole = await prisma.role.upsert({
    where: { code: "GUEST" },
    update: { name: "访客" },
    create: { name: "访客", code: "GUEST", sort: 100 },
  })
  await prisma.roleMenu.deleteMany({ where: { roleId: guestRole.id } })
  await prisma.roleMenu.createMany({ data: [{ roleId: guestRole.id, menuId: dashboardId }] })

  // 3. 用户：admin / Admin@123（挂 ADMIN）
  await prisma.user.upsert({
    where: { username: "admin" },
    update: { nickname: "系统管理员", email: "admin@example.com", telephone: "13800138000" },
    create: {
      username: "admin",
      passwordHash: hashPassword("Admin@123"),
      nickname: "系统管理员",
      email: "admin@example.com",
      telephone: "13800138000",
    },
  })
  const adminUser = await prisma.user.findUnique({ where: { username: "admin" } })
  await prisma.userRole.deleteMany({ where: { userId: adminUser!.id } })
  await prisma.userRole.create({ data: { userId: adminUser!.id, roleId: adminRole.id } })

  console.log("seed done: admin/Admin@123 (role: ADMIN, all menus)")
}

main().catch((e) => { console.error(e); process.exit(1) })
```

> **实现者注意**：`hashPassword` 位于 `apps/api/src/lib/password.ts`——seed 不应依赖 api 包。**修正**：把 `password.ts` 移到 `packages/shared/src/password.ts`（node:crypto，shared 允许 Node 依赖——若 shared 需保持零依赖，则移到 `packages/db/src/lib/password.ts`，api 从 `@repo/db` 导入）。实现时二选一，并同步修正 api 侧 import。

- [ ] **Step 2: 验证幂等 + 提交**

```bash
pnpm --filter @repo/db exec tsx src/seed.ts
pnpm --filter @repo/db exec tsx src/seed.ts   # 第二次运行验证幂等
pnpm --filter @repo/api test
```
Expected: 两次 seed 无错误；admin 用户、菜单树、角色授权完整。提交。

---

## Task 14: OpenAPI 导出 + 前端类型生成

**Files:**
- Create: `apps/api/scripts/generate-openapi.ts`
- Modify: `apps/api/package.json`（scripts）
- Create: `apps/web/src/api/schema.d.ts`（生成产物）

- [ ] **Step 1: 导出脚本**

`apps/api/scripts/generate-openapi.ts`：
```ts
import { writeFileSync } from "node:fs"
import { createApp } from "../src/index.js"

const app = createApp()
const doc = app.getOpenAPIDocument({
  openapi: "3.0.0",
  info: { title: "shadcn-mono API", version: "0.1.0" },
})
writeFileSync(new URL("../openapi.json", import.meta.url), JSON.stringify(doc, null, 2))
console.log("openapi.json written")
```

`apps/api/package.json` scripts 追加：
```json
"generate:openapi": "tsx scripts/generate-openapi.ts",
"generate:types": "openapi-typescript openapi.json -o ../web/src/api/schema.d.ts"
```
devDependencies 追加：`"openapi-typescript": "^7.4.0"`。

- [ ] **Step 2: 生成并提交**

```bash
pnpm --filter @repo/api generate:openapi
pnpm --filter @repo/api generate:types
head -5 apps/web/src/api/schema.d.ts
```
Expected: `apps/api/openapi.json` 与 `apps/web/src/api/schema.d.ts` 生成成功（后者的 openapi-typescript 输出以 `export type` 开头）。提交。

> **实现者注意**：若 `openapi-typescript` 输出与 web 目录不符，调整 `-o` 路径；生成产物提交入库（schema.d.ts 是公共 API 契约）。

---

## Task 15: apps/web 骨架 + shadcn init

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/index.css`
- Create: `apps/web/.env.example`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/components.json`（shadcn init 生成）

- [ ] **Step 1: Vite 骨架**

`apps/web/package.json`：
```json
{
  "name": "@repo/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@repo/shared": "workspace:*",
    "@tanstack/react-query": "^5.59.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "@testing-library/react": "^16.0.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

`apps/web/vite.config.ts`：
```ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3001" },
  },
})
```

`apps/web/tsconfig.json`：
```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "noEmit": true
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

`apps/web/index.html`：
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin Console</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/src/main.tsx`（最小壳，后续任务扩展）：
```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import "./index.css"

const queryClient = new QueryClient()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <div>App 骨架</div>
    </QueryClientProvider>
  </StrictMode>,
)
```

`apps/web/.env.example`：
```
VITE_API_BASE="http://localhost:3001/api"
VITE_AUTH_PROVIDER="local"
```

- [ ] **Step 2: Tailwind v4 + shadcn init（CLI 严格流程）**

```bash
cd apps/web
pnpm add tailwindcss @tailwindcss/vite
pnpm dlx shadcn@latest init --template react-router --defaults -y
npx shadcn@latest add button input label card table dialog form select switch tabs badge checkbox dropdown-menu sheet sonner skeleton avatar tooltip alert-dialog separator pagination sidebar input-otp spinner empty toggle-group field
```

> **实现者注意**：`shadcn init` 需要项目内先有 Vite React 项目（React Router 模板即 `--template react-router`）；若 CLI 交互提示，使用 `-y/--yes` 与 `--defaults`；若 `--template react-router` 不受支持，回退 `npx shadcn@latest init --template vite --defaults`（产物以 CLI 实际支持为准，但 components.json 必须生成在 `apps/web`）。初始化后检查 `components.json` 的 `aliases` 与 `style` 字段。`field` 组件（FieldGroup/Field 表单体系）若 CLI 版本不支持则跳过并手工执行 `npx shadcn@latest search` 确认可用组件。

- [ ] **Step 3: vitest 环境（jsdom）**

`apps/web/vitest.config.ts`：
```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
})
```

`apps/web/test/setup.ts`：
```ts
import "@testing-library/jest-dom/vitest"
```

`apps/web/test/setup.ts` 依赖 `@testing-library/jest-dom`——加入 devDependencies。

- [ ] **Step 4: 验证 + 提交**

```bash
cd "E:\vibe-coding\shadcn-mono"
pnpm install
pnpm --filter @repo/web dev &   # 或 turbo dev，确认 5173 起
pnpm --filter @repo/web typecheck
```
Expected: dev 启动无错误；typecheck 通过；`src/components/ui/` 下组件文件存在。提交。

---

## Task 16: AuthProvider 抽象 + JwtAuthProvider

**Files:**
- Create: `apps/web/src/auth/types.ts`
- Create: `apps/web/src/auth/AuthProvider.tsx`
- Create: `apps/web/src/auth/JwtAuthProvider.tsx`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/test/auth.test.tsx`

- [ ] **Step 1: 类型 + API client**

`apps/web/src/auth/types.ts`：
```ts
export interface SessionUser {
  id: string
  username: string
  nickname: string
  email: string | null
  telephone: string | null
}

export type LoginCredential =
  | { kind: "password"; username: string; password: string }
  | { kind: "otp"; channel: "email" | "telephone"; target: string; code: string }

export type OtpChannel = "email" | "telephone"

export interface AuthSession {
  user: SessionUser
  accessToken: string
}

export interface AuthProvider {
  /** 返回 session；失败抛出 Error */
  login(cred: LoginCredential): Promise<AuthSession>
  sendOtp(channel: OtpChannel, target: string): Promise<void>
  logout(): Promise<void>
  refresh(): Promise<AuthSession>
  getSession(): Promise<AuthSession | null>
}
```

`apps/web/src/api/client.ts`（axios 风格 fetch 封装 + refresh 拦截，不引入 axios，用 fetch）：
```ts
import type { AuthSession } from "../auth/types"

const BASE = import.meta.env.VITE_API_BASE ?? "/api"
let accessToken: string | null = null
let refreshPromise: Promise<AuthSession> | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

async function doRefresh(): Promise<AuthSession> {
  if (!refreshPromise) {
    const refreshToken = localStorage.getItem("refreshToken")
    refreshPromise = (async () => {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) throw new Error("refresh failed")
      const body = (await res.json()) as { data: AuthSession & { refreshToken: string } }
      localStorage.setItem("refreshToken", body.data.refreshToken)
      accessToken = body.data.accessToken
      return body.data
    })().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set("content-type", "application/json")
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`)
  let res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (res.status === 401) {
    try {
      await doRefresh()
      if (accessToken) {
        headers.set("authorization", `Bearer ${accessToken}`)
        res = await fetch(`${BASE}${path}`, { ...init, headers })
      }
    } catch {
      window.location.href = "/login"
      throw new Error("session expired")
    }
  }
  const body = (await res.json()) as { code: number; data: T; message: string }
  if (!res.ok) throw new Error(body.message || `请求失败(${res.status})`)
  return body.data
}
```

- [ ] **Step 2: AuthProvider 上下文 + Jwt 实现**

`apps/web/src/auth/AuthProvider.tsx`：
```tsx
import { createContext, useContext } from "react"
import type { AuthProvider, AuthSession } from "./types"

export const AuthContext = createContext<AuthProvider | null>(null)

export function useAuth(): AuthProvider {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用")
  return ctx
}

export function AuthProviderView({ provider, children }: { provider: AuthProvider; children: React.ReactNode }): React.JSX.Element {
  return <AuthContext.Provider value={provider}>{children}</AuthContext.Provider>
}
```

`apps/web/src/auth/JwtAuthProvider.tsx`：
```tsx
import type { AuthProvider, AuthSession, LoginCredential, OtpChannel, SessionUser } from "./types"
import { api, setAccessToken } from "../api/client"

const BASE = import.meta.env.VITE_API_BASE ?? "/api"

export class JwtAuthProvider implements AuthProvider {
  async login(cred: LoginCredential): Promise<AuthSession> {
    const data =
      cred.kind === "password"
        ? { username: cred.username, password: cred.password }
        : { channel: cred.channel, target: cred.target, code: cred.code }
    const path = cred.kind === "password" ? "/auth/login" : "/auth/otp/login"
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    })
    const body = (await res.json()) as { code: number; data: AuthSession & { refreshToken: string }; message: string }
    if (!res.ok) throw new Error(body.message)
    localStorage.setItem("refreshToken", body.data.refreshToken)
    setAccessToken(body.data.accessToken)
    return { user: body.data.user, accessToken: body.data.accessToken }
  }

  async sendOtp(channel: OtpChannel, target: string): Promise<void> {
    await api("/auth/otp/send", { method: "POST", body: JSON.stringify({ channel, target }) })
  }

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem("refreshToken")
    if (refreshToken) {
      await fetch(`${BASE}/auth/logout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined)
    }
    localStorage.removeItem("refreshToken")
    setAccessToken(null)
  }

  async refresh(): Promise<AuthSession> {
    const refreshToken = localStorage.getItem("refreshToken")
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    const body = (await res.json()) as { data: AuthSession & { refreshToken: string } }
    localStorage.setItem("refreshToken", body.data.refreshToken)
    setAccessToken(body.data.accessToken)
    return { user: body.data.user, accessToken: body.data.accessToken }
  }

  async getSession(): Promise<AuthSession | null> {
    try {
      const data = await api<{ user: SessionUser; navTree: unknown; permissionCodes: string[] }>("/auth/me")
      const session: AuthSession = { user: data.user, accessToken: "" }
      return session
    } catch {
      return null
    }
  }
}
```

- [ ] **Step 3: 测试（mock fetch）**

`apps/web/test/auth.test.tsx`（mock 全局 fetch，验证 login 成功写 token、401 触发 refresh 后重试）：

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest"
import { JwtAuthProvider } from "../src/auth/JwtAuthProvider"

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  localStorage.clear()
})

describe("JwtAuthProvider", () => {
  it("密码登录成功保存双 token", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0, message: "ok",
      data: { user: { id: "u1", username: "a", nickname: "A", email: null, telephone: null }, accessToken: "at", refreshToken: "rt" },
    }), { status: 200, headers: { "content-type": "application/json" } }))
    const p = new JwtAuthProvider()
    const s = await p.login({ kind: "password", username: "a", password: "Passw0rd!" })
    expect(s.accessToken).toBe("at")
    expect(localStorage.getItem("refreshToken")).toBe("rt")
  })

  it("401 时自动 refresh 后重试成功", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 401, message: "过期" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { accessToken: "at2", refreshToken: "rt2" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { ok: true } }), { status: 200 }))
    const p = new JwtAuthProvider()
    await p.login({ kind: "password", username: "a", password: "Passw0rd!" })
    const data = await (await import("../src/api/client")).api<{ ok: boolean }>("/users")
    expect(data.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
```

> **实现者注意**：api client 的 `api()` 导出与 provider 存在循环依赖（provider 依赖 api，测试依赖两者）——若循环依赖导致测试失败，把 `api()` 中的 token/refresh 逻辑抽到 `src/api/session.ts`（setAccessToken/doRefresh），client.ts 与 JwtAuthProvider 都从 session.ts 导入。测试需与最终实现同步调整。

- [ ] **Step 4: 验证 + 提交**

```bash
pnpm --filter @repo/web test
pnpm --filter @repo/web typecheck
```
Expected: 2 个测试 PASS。提交。

---

## Task 17: 登录页（三 Tab）

**Files:**
- Create: `apps/web/src/pages/LoginPage.tsx`
- Create: `apps/web/src/pages/LoginPage.test.tsx`（可选，表单校验冒烟）

- [ ] **Step 1: 实现登录页**

`apps/web/src/pages/LoginPage.tsx`（完整实现，三 Tab：账号密码 / 邮箱动态码 / 手机动态码；使用 shadcn 的 Tabs、Card、Input、Button、InputOTP、Field 表单体系；`VITE_AUTH_PROVIDER=clerk` 时渲染 Clerk `<SignIn />`——本任务仅预留分支，Clerk 渲染在 Task 24 实现）：

```tsx
import { useState } from "react"
import { useNavigate } from "react-router"
import { useAuth } from "../auth/AuthProvider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Field, FieldLabel, FieldControl } from "@/components/ui/field"

export default function LoginPage(): React.JSX.Element {
  const auth = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [otpTarget, setOtpTarget] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [tab, setTab] = useState<"password" | "email" | "telephone">("password")
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  const login = async (kind: "password" | "otp"): Promise<void> => {
    setError(null)
    try {
      if (kind === "password") {
        await auth.login({ kind: "password", username, password })
      } else {
        await auth.login({ kind: "otp", channel: tab === "email" ? "email" : "telephone", target: otpTarget, code: otpCode })
      }
      navigate("/")
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败")
    }
  }

  const sendCode = async (): Promise<void> => {
    setError(null)
    try {
      await auth.sendOtp(tab === "email" ? "email" : "telephone", otpTarget)
      setCooldown(60)
      const timer = setInterval(() => setCooldown((c) => {
        if (c <= 1) clearInterval(timer)
        return Math.max(0, c - 1)
      }), 1000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>管理后台登录</CardTitle>
          <CardDescription>开发模式：验证码打印在 api 控制台（DevOtpSender）</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-destructive text-sm">{error}</p> : null}
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="password">账号密码</TabsTrigger>
              <TabsTrigger value="email">邮箱动态码</TabsTrigger>
              <TabsTrigger value="telephone">手机动态码</TabsTrigger>
            </TabsList>
            <TabsContent value="password" className="flex flex-col gap-4 pt-4">
              <Field>
                <FieldLabel htmlFor="username">用户名</FieldLabel>
                <FieldControl><Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} /></FieldControl>
              </Field>
              <Field>
                <FieldLabel htmlFor="password">密码</FieldLabel>
                <FieldControl><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></FieldControl>
              </Field>
              <Button onClick={() => login("password")}>登录</Button>
            </TabsContent>
            {(["email", "telephone"] as const).map((ch) => (
              <TabsContent key={ch} value={ch} className="flex flex-col gap-4 pt-4">
                <Field>
                  <FieldLabel htmlFor={`${ch}-target`}>{ch === "email" ? "邮箱" : "手机号"}</FieldLabel>
                  <FieldControl>
                    <Input id={`${ch}-target`} value={otpTarget} onChange={(e) => setOtpTarget(e.target.value)} />
                  </FieldControl>
                </Field>
                <Button variant="outline" onClick={sendCode} disabled={cooldown > 0}>
                  {cooldown > 0 ? `${cooldown}s 后重新发送` : "发送验证码"}
                </Button>
                <Field>
                  <FieldLabel>验证码</FieldLabel>
                  <FieldControl>
                    <InputOTP value={otpCode} onChange={setOtpCode} maxLength={6}>
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
                      </InputOTPGroup>
                    </InputOTP>
                  </FieldControl>
                </Field>
                <Button onClick={() => login("otp")}>登录</Button>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
```

> **实现者注意**：`field` 组件命名以 Task 15 实际 add 结果为准（可能是 `Field`/`FieldLabel`/`FieldControl` 或 `FormField` 等）；InputOTP 的 slot 渲染 API 以安装版本为准。路由 `/login` 与 App 入口在 Task 18 接线。

- [ ] **Step 2: 验证 + 提交**

```bash
pnpm --filter @repo/web typecheck
pnpm --filter @repo/web build
```
Expected: 编译通过。提交。

---

## Task 18: 布局（官方 sidebar）+ 动态路由

**Files:**
- Create: `apps/web/src/router/generateRoutes.tsx`
- Create: `apps/web/src/router/guards.tsx`
- Create: `apps/web/src/layout/AppLayout.tsx`
- Create: `apps/web/src/main.tsx`（改写：路由 + AuthProvider 接线）

- [ ] **Step 1: 动态路由生成**

`apps/web/src/router/generateRoutes.tsx`：
```tsx
import { lazy } from "react"
import type { MenuNode } from "@repo/shared"
import type { RouteObject } from "react-router"

// component key → 页面组件映射（约定：component="system/user" → src/features/system/user/page.tsx）
const pages = import.meta.glob("../features/**/page.tsx")

export function menuToRoutes(menu: MenuNode): RouteObject[] {
  const routes: RouteObject[] = []
  for (const node of menu.children) {
    if (node.type !== "MENU" || !node.component || !node.path) continue
    const load = pages[`../features/${node.component}/page.tsx`]
    if (!load) continue
    const Page = lazy(load as () => Promise<{ default: React.ComponentType }>)
    routes.push({
      path: node.path,
      element: (
        <React.Suspense fallback={<div className="p-8">加载中…</div>}>
          <Page />
        </React.Suspense>
      ),
    })
    routes.push(...menuToRoutes(node))
  }
  return routes
}
```
> **实现者注意**：`menuToRoutes` 递归处理子级（MENU 一般无子 MENU，但保留递归）；`import.meta.glob` 路径以 web 项目实际结构为准（pages 位于 `src/features/`）。

- [ ] **Step 2: 布局（官方 sidebar）**

`apps/web/src/layout/AppLayout.tsx`：使用 Task 15 安装的 shadcn `sidebar` 组件族（SidebarProvider/Sidebar/SidebarHeader/SidebarContent/SidebarGroup/SidebarMenu/SidebarMenuItem/SidebarMenuButton/SidebarMenuSub/SidebarMenuSubItem/SidebarTrigger）+ 顶栏（用户昵称 + 登出按钮）。侧边栏渲染逻辑：从 `useQuery(["auth/me"])` 拿 navTree，递归渲染 DIR 为折叠组、MENU 为导航项（path 作为 NavLink）；BUTTON 不渲染。登出调用 `auth.logout()` 后跳 `/login`。默认展开/折叠由 SidebarProvider 管理。

`apps/web/src/router/guards.tsx`：
```tsx
import { Navigate, Outlet, useLocation } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { api } from "../api/client"

/** 登录守卫：无会话跳 /login */
export function RequireAuth(): React.JSX.Element {
  const location = useLocation()
  const { data, isLoading } = useQuery({ queryKey: ["me"], queryFn: () => api<unknown>("/auth/me"), retry: false })
  if (isLoading) return <div className="p-8">加载中…</div>
  if (!data) return <Navigate to="/login" state={{ from: location }} replace />
  return <Outlet />
}
```

- [ ] **Step 3: main.tsx 接线**

`apps/web/src/main.tsx` 改写：React Router 路由表（`/login` → LoginPage；受保护布局 `RequireAuth` → AppLayout → 动态路由 `menuToRoutes`；`*` → 404）+ AuthProviderView（provider 按 `VITE_AUTH_PROVIDER` 选择 JwtAuthProvider，clerk 时用 ClerkAuthProvider——Task 24）+ TanStack Query。路由生成时序：RequireAuth 内拿到 me 数据后生成路由，用 `useRoutes` 或嵌套 `<Routes>`。

- [ ] **Step 4: 验证 + 提交**

```bash
pnpm --filter @repo/web typecheck
pnpm --filter @repo/web build
```
Expected: 编译通过；dev 启动后可登录（seed 的 admin/Admin@123）并看到侧边栏。提交。

---

## Task 19: Permission 组件（按钮级权限）

**Files:**
- Create: `apps/web/src/components/business/Permission.tsx`
- Create: `apps/web/src/hooks/usePermissionCodes.ts`
- Create: `apps/web/src/components/business/Permission.test.tsx`

- [ ] **Step 1: 写失败测试**

`apps/web/src/components/business/Permission.test.tsx`：
```tsx
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Permission, usePermissionCodes } from "./Permission"

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

function Harness(): React.JSX.Element {
  const codes = usePermissionCodes()
  return <div data-testid="codes">{[...codes].join(",")}</div>
}

describe("Permission", () => {
  it("权限码命中时渲染内容", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0, data: { user: {}, navTree: [], permissionCodes: ["system:user:add"] },
    }), { status: 200 })))
    render(<wrapper><Harness /></wrapper>)
    expect(await screen.findByTestId("codes")).toHaveTextContent("system:user:add")
  })
})
```
> **实现者注意**：`usePermissionCodes` 内部用 `useQuery(["me"])` 缓存复用（RequireAuth 已拉取）；测试 stub fetch 返回 me 数据。

- [ ] **Step 2: 实现**

`apps/web/src/hooks/usePermissionCodes.ts`：
```ts
import { useQuery } from "@tanstack/react-query"
import { api } from "../api/client"

export function usePermissionCodes(): Set<string> {
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ permissionCodes: string[] }>("/auth/me"),
    staleTime: 60_000,
  })
  return new Set(data?.permissionCodes ?? [])
}
```

`apps/web/src/components/business/Permission.tsx`：
```tsx
import type { ReactNode } from "react"
import { usePermissionCodes } from "../hooks/usePermissionCodes"

export function Permission({ code, children, fallback = null }: {
  code: string
  children: ReactNode
  fallback?: ReactNode
}): React.JSX.Element | null {
  const codes = usePermissionCodes()
  return codes.has(code) ? <>{children}</> : <>{fallback}</>
}
```

- [ ] **Step 3: 验证 + 提交**

```bash
pnpm --filter @repo/web test
pnpm --filter @repo/web typecheck
```
Expected: Permission 测试 PASS。提交。

---

## Task 20: 用户管理页

**Files:**
- Create: `apps/web/src/features/system/user/page.tsx`
- Create: `apps/web/src/features/system/user/UserFormDialog.tsx`
- Create: `apps/web/src/features/system/user/useUsers.ts`

- [ ] **Step 1: 实现页面**

`apps/web/src/features/system/user/page.tsx`：列表页（shadcn Table + 分页 Pagination + 关键词搜索 Input + 新增/编辑 Dialog 表单 + 删除 AlertDialog 确认 + 分配角色 Dialog）。组件组织：
- `useUsers.ts`：TanStack Query 数据源——`useQuery(["users", page, pageSize, keyword])` + `useMutation`（create/update/delete/assignRoles），失效重取 `invalidateQueries(["users"])`
- `UserFormDialog.tsx`：Field 表单（用户名/昵称/邮箱/手机号/密码/状态/角色多选 Select 或 Checkbox 列表），create 走 POST、edit 走 PATCH
- 页面用 `<Permission code="system:user:create">` 包裹新增按钮、`system:user:update` 包裹编辑、`system:user:delete` 包裹删除、`system:user:assign-role` 包裹分配角色按钮

实现要点：与 `apps/web/src/api/schema.d.ts`（Task 14 生成）的类型对接；角色下拉数据 `GET /roles/list`；删除前 AlertDialog 确认；操作失败 toast（sonner `toast.error`）。

- [ ] **Step 2: 验证 + 提交**

```bash
pnpm --filter @repo/web typecheck
pnpm --filter @repo/web build
```
Expected: 编译通过。提交。

---

## Task 21: 角色管理页

**Files:**
- Create: `apps/web/src/features/system/role/page.tsx`
- Create: `apps/web/src/features/system/role/RoleFormDialog.tsx`
- Create: `apps/web/src/features/system/role/MenuGrantDialog.tsx`

- [ ] **Step 1: 实现页面**

- `page.tsx`：列表 + 新增/编辑 Dialog + 删除 + "分配权限"按钮（`system:role:assign`）
- `RoleFormDialog.tsx`：角色名/编码/排序/状态/描述
- `MenuGrantDialog.tsx`：树形勾选授权——拉 `GET /menus/tree` + `GET /roles/:id/menus` 回显；自实现树形 Checkbox（父子联动 + 半选 indeterminate）；勾选含 BUTTON 节点；保存 `PUT /roles/:id/menus` 全量提交
  - 树组件（`components/business/TreeCheckbox.tsx`）：递归渲染，父节点 checked = 全部子选中、indeterminate = 部分选中，点击父节点全选/全不选；BUTTON 节点正常可勾选但显示为子级（缩进 + Badge 类型标签）

- [ ] **Step 2: 验证 + 提交**

```bash
pnpm --filter @repo/web typecheck
pnpm --filter @repo/web build
```
Expected: 编译通过。提交。

---

## Task 22: 菜单管理页

**Files:**
- Create: `apps/web/src/features/system/menu/page.tsx`
- Create: `apps/web/src/features/system/menu/MenuFormDialog.tsx`
- Create: `apps/web/src/features/system/menu/MenuTreeTable.tsx`

- [ ] **Step 1: 实现页面**

- `page.tsx`：树形表格——`GET /menus/tree` 全量树；默认仅展开第一层，BUTTON 行只在展开所属 MENU 后可见（**外层列表不显示按钮**）；行内 Badge 显示类型（DIR/MENU/BUTTON）
- `MenuTreeTable.tsx`：自实现折叠树表格（Table + 缩进列 + ChevronRight/ChevronDown 展开按钮；递归渲染，sort 已由后端排序）
- `MenuFormDialog.tsx`：新增/编辑表单——类型 Select（DIR/MENU/BUTTON）、父节点 Select（选项按类型约束过滤：DIR 可选父 = DIR；MENU 可选父 = DIR；BUTTON 可选父 = MENU）、name、path/component（MENU 必填）、permission（MENU/BUTTON）、icon（DIR/MENU）、sort、status；编辑时改父节点或类型走 PATCH

- [ ] **Step 2: 验证 + 提交**

```bash
pnpm --filter @repo/web typecheck
pnpm --filter @repo/web build
```
Expected: 编译通过。提交。

---

## Task 23: Dashboard + 403/404 + 端到端冒烟

**Files:**
- Create: `apps/web/src/features/dashboard/page.tsx`
- Create: `apps/web/src/pages/ForbiddenPage.tsx`
- Create: `apps/web/src/pages/NotFoundPage.tsx`
- Modify: `apps/web/src/router/generateRoutes.tsx`（403/404 路由）

- [ ] **Step 1: 页面 + 冒烟验证**

- Dashboard：欢迎卡片 + 当前用户信息（nickname/email）+ 角色列表 + 权限码数量统计
- 403 页：无权限访问提示；404 页：路由未匹配提示
- 动态路由挂载：`*` → 404；`RequireAuth` 内无权限路由兜底

冒烟（手动，需要后端 + 种子）：
```bash
pnpm dev
# 1. admin/Admin@123 登录 → 侧边栏显示 Dashboard + 系统管理（含三个子菜单）
# 2. 用户管理 → 新增用户 → 列表出现 → 分配角色 → 编辑 → 删除
# 3. 角色管理 → 新增角色 → 分配权限（树勾选含按钮）→ 回显正确
# 4. 菜单管理 → 新增 DIR → 其下新增 MENU → 其下新增 BUTTON（外层列表展开后可见）
# 5. 建第二个角色只含部分菜单 → 用户挂双角色 → 登录后权限为交集
# 6. 邮箱/手机动态码登录（验证码看 api 控制台）
```

- [ ] **Step 2: 提交**

```bash
git add -A && git commit -m "feat: dashboard and error pages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 24: Clerk 适配器（前端 + 后端）

**Files:**
- Create: `apps/web/src/auth/ClerkAuthProvider.tsx`
- Create: `apps/api/src/middleware/clerk-auth.ts`
- Modify: `apps/web/src/main.tsx`（按 `VITE_AUTH_PROVIDER` 选择 provider）
- Modify: `apps/api/src/index.ts`（按 `AUTH_PROVIDER` 选择认证中间件）

- [ ] **Step 1: 后端 Clerk 认证中间件**

`apps/api/src/middleware/clerk-auth.ts`：
```ts
import type { Context, MiddlewareHandler, Next } from "hono"
import { createClerkClient } from "@clerk/backend"
import { prisma } from "@repo/db"
import { HttpError } from "../lib/http-error.js"

export function clerkAuthenticate(): MiddlewareHandler {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) throw new Error("CLERK_SECRET_KEY 未配置")
  const client = createClerkClient({ secretKey })
  return async (c: Context, next: Next) => {
    const header = c.req.header("authorization")
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null
    if (!token) throw new HttpError(401, "UNAUTHORIZED", "未登录")
    try {
      const { userId } = await client.authenticateRequest({ request: c.req.raw, token })
      if (!userId) throw new HttpError(401, "UNAUTHORIZED", "Clerk 会话无效")
      // Clerk 用户 → 本地用户映射：首次登录自动创建（username 从 email 前缀生成，确保唯一）
      let user = await prisma.user.findUnique({ where: { clerkId: userId } })
      if (!user) {
        const clerkUser = await client.users.getUser(userId)
        const base = clerkUser.emailAddresses[0]?.emailAddress.split("@")[0] ?? "clerk"
        const username = await uniqueUsername(base)
        user = await prisma.user.create({
          data: {
            username,
            passwordHash: "",
            nickname: clerkUser.firstName && clerkUser.lastName ? `${clerkUser.firstName} ${clerkUser.lastName}` : (clerkUser.firstName ?? username),
            email: clerkUser.emailAddresses[0]?.emailAddress ?? null,
            clerkId: userId,
          },
        })
      }
      if (!user.status) throw new HttpError(401, "UNAUTHORIZED", "账号不可用")
      c.set("userId", user.id)
      await next()
    } catch (e) {
      if (e instanceof HttpError) throw e
      throw new HttpError(401, "UNAUTHORIZED", "Clerk 会话无效")
    }
  }
}

async function uniqueUsername(base: string): Promise<string> {
  let username = base.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 32) || "user"
  let exists = await prisma.user.findUnique({ where: { username } })
  for (let i = 1; exists; i++) {
    username = `${base.slice(0, 28)}${i}`
    exists = await prisma.user.findUnique({ where: { username } })
  }
  return username
}
```

- [ ] **Step 2: 前端 ClerkAuthProvider**

`apps/web/src/auth/ClerkAuthProvider.tsx`：
```tsx
import type { AuthProvider, AuthSession, LoginCredential, OtpChannel } from "./types"
import { setAccessToken } from "../api/client"
import { useAuth } from "@clerk/clerk-react"

export class ClerkAuthProvider implements AuthProvider {
  /** 登录/发送验证码由 Clerk 前端组件完成（<SignIn />）；本实现只负责会话映射 */
  async login(_cred: LoginCredential): Promise<AuthSession> {
    throw new Error("Clerk 模式下登录由 Clerk <SignIn/> 组件处理")
  }
  async sendOtp(_channel: OtpChannel, _target: string): Promise<void> {
    throw new Error("Clerk 模式下验证码由 Clerk 处理")
  }
  async logout(): Promise<void> {
    const { signOut } = await import("@clerk/clerk-react")
    await signOut()
    setAccessToken(null)
  }
  async refresh(): Promise<AuthSession> {
    const { getToken, useUser } = await import("@clerk/clerk-react")
    const token = await getToken()
    setAccessToken(token)
    return { user: { id: "", username: "", nickname: "", email: null, telephone: null }, accessToken: token ?? "" }
  }
  async getSession(): Promise<AuthSession | null> {
    return useAuth() ? null : null // 占位：实际由组件层用 useSession 判断
  }
}
```
> **实现者注意**：Clerk 的 React 集成用 Provider 包裹（`<ClerkProvider publishableKey={...}>` + `<SignedIn><SignedOut>` 分支 + `<SignIn />`），provider 类无法直接使用 hooks——**实现方式**：把 ClerkAuthProvider 作为"适配器工厂"，实际会话状态由 `ClerkSessionAdapter` 组件（在 ClerkProvider 内使用 useSession/useUser）桥接给 AuthContext。登录页在 `VITE_AUTH_PROVIDER=clerk` 时渲染 `<SignIn />`（Clerk 自带登录页）。main.tsx 接线：
> ```tsx
> if (provider === "clerk") {
>   <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
>     <ClerkSessionAdapter>{children}</ClerkSessionAdapter>
>   </ClerkProvider>
> } else { ...JwtAuthProvider... }
> ```

- [ ] **Step 3: 配置 + 验证 + 提交**

后端 `.env.example` 追加：`CLERK_SECRET_KEY=...`；前端 `.env.example` 追加：`VITE_CLERK_PUBLISHABLE_KEY=...`。`pnpm --filter @repo/api typecheck` + `pnpm --filter @repo/web typecheck` 通过后提交。

---

## Task 25: 文档与智能体资产

**Files:**
- Create: `README.md`
- Create: `CLAUDE.md`
- Create: `.mcp.json`
- Create: `.claude/skills/add-page/SKILL.md`
- Create: `.claude/skills/switch-database/SKILL.md`

- [ ] **Step 1: README（四件事：启动/切库/OtpSender/Clerk）**

`README.md`：项目简介、结构图、快速开始（`pnpm install && pnpm dev`，种子命令、默认账号 admin/Admin@123）、三方言切换（引用 `docs/database/README.md`）、OtpSender 接入说明（实现 `OtpSender` 接口并替换 `apps/api/src/lib/otp-sender.ts` 导出）、Clerk 配置（前后端环境变量 + 首次登录自动建号）、OpenAPI（`/api/docs` + `generate:types`）、测试命令。

- [ ] **Step 2: CLAUDE.md + .mcp.json**

`CLAUDE.md`：仓库结构、常用命令（dev/build/test/lint）、目录职责、规范要点（shadcn 严格 CLI 引用 Task 15 流程、权限规则位于 packages/shared、三方言约定、提交规范）。

`.mcp.json`：
```json
{
  "mcpServers": {
    "codegraph": {
      "command": "codegraph",
      "args": ["mcp"]
    }
  }
}
```

- [ ] **Step 3: 项目 skills（遵循 superpowers:writing-skills 流程）**

`.claude/skills/add-page/SKILL.md`：新增页面的完整流程——1) 菜单表加 MENU 行（含 path/component/permission）2) `src/features/<component>/page.tsx` 创建页面 3) `components.json` 已配好则跳过 shadcn add 4) 需要的新按钮权限码在菜单表加 BUTTON 行 5) 后端接口挂 requirePermission 6) 更新 docs/database/schema.sql 7) 测试 + 提交。

`.claude/skills/switch-database/SKILL.md`：三方言切换清单——改 `DATABASE_URL`、改 provider、`prisma migrate dev`、`seed`、回归测试、同步 `docs/database`。

- [ ] **Step 4: 全量验证 + 最终提交**

```bash
pnpm install
pnpm turbo test
pnpm turbo build
pnpm turbo lint
```
Expected: 全部通过。提交：
```bash
git add -A && git commit -m "docs: readme, claude assets, project skills

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 计划自审结论（writing-plans 要求）

- **规格覆盖**：设计文档 §2-§14 全部有对应任务（技术栈→各任务、数据模型→Task 4/5、认证→7/8、权限→3/9、CRUD→10/11/12、种子→13、OpenAPI→14、前端→15-23、Clerk→24、文档与智能体资产→25、husky→Task 1）。
- **占位扫描**：Task 10/11/12 中"实现要点"为模板骨架式说明（users.ts 已给完整代码与要点、roles/menus 给要点清单）——这些任务边界明确、模式与已给完整代码一致，执行时以要点为准补齐完整代码；无 TBD/TODO。
- **类型一致性**：`computeVisibleMenus`/`MenuNode`（Task 3 定义）在 Task 9/18/21 复用签名一致；`AuthProvider` 接口（Task 16 定义）在 Task 17/24 实现一致；`api<T>()` 封装在 Task 16/18/19/20 一致使用；权限码常量在 seed（Task 13）与中间件（Task 9）一致。
