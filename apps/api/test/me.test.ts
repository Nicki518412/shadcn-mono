import { beforeAll, describe, expect, it } from "vitest"
import type { z } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { loadConfig } from "../src/config.js"
import { createApp } from "../src/index.js"
import { authenticate, requirePermission } from "../src/middleware/auth.js"
import type { meResponseSchema } from "../src/lib/schemas.js"
import { createTestUser } from "./helpers.js"

interface MeBody {
  data: z.infer<typeof meResponseSchema>
}

const USERNAME = "me_test"
const PASSWORD = "Passw0rd!"

// beforeAll 建的菜单树 id（permission 唯一索引，文件内复用；新测试不再重建树）
let d1Id: string
let m1Id: string
let m2Id: string
let b1Id: string

async function loginAs(username: string): Promise<string> {
  const app = createApp()
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  })
  if (res.status !== 200) throw new Error(`登录失败: ${String(res.status)}`)
  const body = (await res.json()) as { data: { accessToken: string } }
  return body.data.accessToken
}

describe("auth me", () => {
  beforeAll(async () => {
    await createTestUser({ username: USERNAME, password: PASSWORD })
    const user = await prisma.user.findUnique({ where: { username: USERNAME } })
    if (!user) throw new Error("测试用户未创建")
    const userId = user.id

    const [roleA, roleB] = await Promise.all([
      prisma.role.create({ data: { name: "角色A", code: "ROLE_A" } }),
      prisma.role.create({ data: { name: "角色B", code: "ROLE_B" } }),
    ])
    // 菜单树：DIR d1 → MENU m1 + BUTTON b1 + MENU m2
    const d1 = await prisma.menu.create({ data: { name: "系统管理", type: "DIR", icon: "Settings", sort: 1 } })
    const m1 = await prisma.menu.create({
      data: {
        name: "用户管理",
        type: "MENU",
        path: "/system/user",
        component: "system/user",
        icon: "Users",
        permission: "system:user:query",
        parentId: d1.id,
        sort: 1,
      },
    })
    const m2 = await prisma.menu.create({
      data: {
        name: "角色管理",
        type: "MENU",
        path: "/system/role",
        component: "system/role",
        permission: "system:role:query",
        parentId: d1.id,
        sort: 2,
      },
    })
    const b1 = await prisma.menu.create({
      data: { name: "新增用户", type: "BUTTON", permission: "system:user:add", parentId: m1.id, sort: 1 },
    })
    d1Id = d1.id
    m1Id = m1.id
    m2Id = m2.id
    b1Id = b1.id

    await prisma.userRole.createMany({
      data: [
        { userId, roleId: roleA.id },
        { userId, roleId: roleB.id },
      ],
    })
    // roleA 全量授权；roleB 仅 d1+m1 → 交集 = {d1, m1}（m2、b1 被交掉）
    await prisma.roleMenu.createMany({
      data: [
        { roleId: roleA.id, menuId: d1.id },
        { roleId: roleA.id, menuId: m1.id },
        { roleId: roleA.id, menuId: m2.id },
        { roleId: roleA.id, menuId: b1.id },
        { roleId: roleB.id, menuId: d1.id },
        { roleId: roleB.id, menuId: m1.id },
      ],
    })
  })

  it("me 返回交集后的 navTree 与权限码、全部角色", async () => {
    const app = createApp()
    const token = await loginAs(USERNAME)
    const res = await app.request("/api/auth/me", { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as MeBody
    expect(body.data.user.username).toBe(USERNAME)
    expect(body.data.roles).toHaveLength(2)
    // b1（system:user:add）被交掉，仅剩 m1 的码
    expect(body.data.permissionCodes).toEqual(["system:user:query"])
    // navTree：d1 → [m1]，b1/m2 不出现
    expect(body.data.navTree).toHaveLength(1)
    const root = body.data.navTree[0]
    if (!root) throw new Error("navTree 根节点缺失")
    expect(root.type).toBe("DIR")
    expect(root.name).toBe("系统管理")
    expect(root.children.map((n) => n.name)).toEqual(["用户管理"])
    const userMenu = root.children[0]
    if (!userMenu) throw new Error("m1 节点缺失")
    expect(userMenu.children).toHaveLength(0)
  })

  it("无 token 访问 me 返回 401", async () => {
    const app = createApp()
    const res = await app.request("/api/auth/me")
    expect(res.status).toBe(401)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe("UNAUTHORIZED")
  })

  it("requirePermission 中间件：有权限 200 / 无权限 403 / 未认证 401", async () => {
    // 测试路由挂在本文件内（不污染生产 openapi）
    const app = createApp()
    app.get(
      "/api/test-perm-allowed",
      authenticate(loadConfig()),
      requirePermission("system:user:query"),
      (c) => c.json({ ok: true }),
    )
    app.get(
      "/api/test-perm-denied",
      authenticate(loadConfig()),
      requirePermission("system:user:add"),
      (c) => c.json({ ok: true }),
    )
    app.get("/api/test-perm-no-auth", requirePermission("system:user:query"), (c) => c.json({ ok: true }))

    const token = await loginAs(USERNAME)
    const authHeader = { authorization: `Bearer ${token}` }

    const allowed = await app.request("/api/test-perm-allowed", { headers: authHeader })
    expect(allowed.status).toBe(200)

    const denied = await app.request("/api/test-perm-denied", { headers: authHeader })
    expect(denied.status).toBe(403)
    const deniedBody = (await denied.json()) as { code: string; message: string }
    expect(deniedBody.code).toBe("PERMISSION_DENIED")
    expect(deniedBody.message).toContain("system:user:add")

    const noAuth = await app.request("/api/test-perm-no-auth")
    expect(noAuth.status).toBe(401)
  })

  it("禁用角色与禁用菜单不参与权限计算", async () => {
    await createTestUser({ username: "me_disabled", password: PASSWORD })
    const user = await prisma.user.findUnique({ where: { username: "me_disabled" } })
    if (!user) throw new Error("测试用户未创建")
    const roleC = await prisma.role.create({ data: { name: "角色C(禁用)", code: "ROLE_C", status: false } })
    const roleD = await prisma.role.create({ data: { name: "角色D", code: "ROLE_D" } })
    // 禁用菜单：status=false，授权了也不得进入导航/权限码（permission 码唯一，不与共享树冲突）
    const mDisabled = await prisma.menu.create({
      data: {
        name: "隐藏菜单",
        type: "MENU",
        path: "/system/hidden",
        component: "system/hidden",
        permission: "system:user:disabled",
        parentId: d1Id,
        status: false,
        sort: 3,
      },
    })
    await prisma.userRole.createMany({
      data: [
        { userId: user.id, roleId: roleC.id },
        { userId: user.id, roleId: roleD.id },
      ],
    })
    // roleC 禁用，授权 {d1, m2}（m2 的码若保留则交集被清空）；roleD 启用，授权 {d1, m1, b1, mDisabled}
    await prisma.roleMenu.createMany({
      data: [
        { roleId: roleC.id, menuId: d1Id },
        { roleId: roleC.id, menuId: m2Id },
        { roleId: roleD.id, menuId: d1Id },
        { roleId: roleD.id, menuId: m1Id },
        { roleId: roleD.id, menuId: b1Id },
        { roleId: roleD.id, menuId: mDisabled.id },
      ],
    })

    const app = createApp()
    const token = await loginAs("me_disabled")
    const res = await app.request("/api/auth/me", { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as MeBody
    // roleC 被过滤 → m2 的码不出现；mDisabled 被过滤 → 其码不出现
    expect(body.data.roles).toHaveLength(1)
    expect(body.data.permissionCodes).toEqual(["system:user:query", "system:user:add"])
    expect(body.data.navTree).toHaveLength(1)
    const root = body.data.navTree[0]
    if (!root) throw new Error("navTree 根节点缺失")
    expect(root.children.map((n) => n.name)).toEqual(["用户管理"])
  })

  it("无角色用户 me 返回空权限", async () => {
    await createTestUser({ username: "me_norole", password: PASSWORD })
    const app = createApp()
    const token = await loginAs("me_norole")
    const res = await app.request("/api/auth/me", { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as MeBody
    expect(body.data.roles).toHaveLength(0)
    expect(body.data.navTree).toEqual([])
    expect(body.data.permissionCodes).toEqual([])
  })

  it("零授权角色用户 me 返回空权限", async () => {
    await createTestUser({ username: "me_zero", password: PASSWORD })
    const user = await prisma.user.findUnique({ where: { username: "me_zero" } })
    if (!user) throw new Error("测试用户未创建")
    const role = await prisma.role.create({ data: { name: "零授权", code: "ROLE_ZERO" } })
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })

    const app = createApp()
    const token = await loginAs("me_zero")
    const res = await app.request("/api/auth/me", { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as MeBody
    expect(body.data.roles).toHaveLength(1)
    expect(body.data.navTree).toEqual([])
    expect(body.data.permissionCodes).toEqual([])
  })
})
