import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { z } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { createApp } from "../src/index.js"
import { hashPassword } from "../src/lib/password.js"
import type { userDetailSchema, userPageResultSchema } from "../src/lib/schemas.js"

const ADMIN_USERNAME = "perm_admin"
const ADMIN_PASSWORD = "Passw0rd!"

interface PageBody {
  data: z.infer<typeof userPageResultSchema>
}
interface DetailBody {
  data: z.infer<typeof userDetailSchema>
}

// beforeAll 建的记录 id（测试间复用）
let adminId: string
let adminRoleId: string

/** 按权限码查菜单，不存在则创建（permission 唯一索引：其他测试文件可能已建同码菜单，复用而非重建） */
async function upsertMenu(data: {
  name: string
  type: string
  permission: string
  parentId?: string
  path?: string
  component?: string
  icon?: string
  sort: number
}): Promise<{ id: string }> {
  const existing = await prisma.menu.findUnique({ where: { permission: data.permission } })
  return existing ?? prisma.menu.create({ data })
}

async function loginAdmin(): Promise<string> {
  const app = createApp()
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  })
  if (res.status !== 200) throw new Error(`登录失败: ${String(res.status)}`)
  const body = (await res.json()) as { data: { accessToken: string } }
  return body.data.accessToken
}

describe("users CRUD", () => {
  beforeAll(async () => {
    // 管理员：perm_admin + ADMIN 角色；菜单树按权限码复用/补齐（Task 13 seed 前菜单表为空，须自建才有 system:user:* 码）
    const admin = await prisma.user.create({
      data: { username: ADMIN_USERNAME, passwordHash: await hashPassword(ADMIN_PASSWORD), nickname: "管理员" },
    })
    adminId = admin.id
    const role = await prisma.role.create({ data: { name: "管理员", code: "ADMIN" } })
    adminRoleId = role.id
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })

    const dir = await prisma.menu.create({ data: { name: "系统管理", type: "DIR", icon: "Settings", sort: 1 } })
    const mUser = await upsertMenu({
      name: "用户管理",
      type: "MENU",
      permission: "system:user:query",
      path: "/system/user",
      component: "system/user",
      icon: "Users",
      parentId: dir.id,
      sort: 1,
    })
    const bCreate = await upsertMenu({
      name: "用户新增",
      type: "BUTTON",
      permission: "system:user:create",
      parentId: mUser.id,
      sort: 1,
    })
    const bUpdate = await upsertMenu({
      name: "用户编辑",
      type: "BUTTON",
      permission: "system:user:update",
      parentId: mUser.id,
      sort: 2,
    })
    const bDelete = await upsertMenu({
      name: "用户删除",
      type: "BUTTON",
      permission: "system:user:delete",
      parentId: mUser.id,
      sort: 3,
    })
    const bAssign = await upsertMenu({
      name: "分配角色",
      type: "BUTTON",
      permission: "system:user:assign-role",
      parentId: mUser.id,
      sort: 4,
    })
    await prisma.roleMenu.createMany({
      data: [dir, mUser, bCreate, bUpdate, bDelete, bAssign].map((menu) => ({
        roleId: role.id,
        menuId: menu.id,
      })),
    })
  })

  // 清理上个用例留下的 crud_ 用户（含其 UserRole，级联），避免测试间污染
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: "crud_" } } })
  })

  it("分页列表：GET /api/users?page=1&pageSize=10 返回 list + total", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const res = await app.request("/api/users?page=1&pageSize=10", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as PageBody
    expect(Array.isArray(body.data.list)).toBe(true)
    expect(typeof body.data.total).toBe("number")
  })

  it("创建用户：大写用户名存储为小写；重复用户名 409（message 含“用户名”）", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const create = await app.request("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: "Crud_New", password: "Passw0rd!", nickname: "新用户" }),
    })
    expect(create.status).toBe(200)
    const stored = await prisma.user.findUnique({ where: { username: "crud_new" } })
    expect(stored?.nickname).toBe("新用户")

    const dup = await app.request("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: "crud_new", password: "Passw0rd!", nickname: "重复" }),
    })
    expect(dup.status).toBe(409)
    const dupBody = (await dup.json()) as { code: string; message: string }
    expect(dupBody.message).toContain("用户名")
  })

  it("更新用户：改昵称/密码/角色；旧密码失效、新密码可登录", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const user = await prisma.user.create({
      data: { username: "crud_upd", passwordHash: await hashPassword("Passw0rd!"), nickname: "旧名" },
    })
    const res = await app.request(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: "新名", password: "NewPassw0rd!", roleIds: [adminRoleId] }),
    })
    expect(res.status).toBe(200)
    const updated = await prisma.user.findUnique({ where: { id: user.id }, include: { roles: true } })
    expect(updated?.nickname).toBe("新名")
    expect(updated?.roles).toHaveLength(1)

    const oldLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "crud_upd", password: "Passw0rd!" }),
    })
    expect(oldLogin.status).toBe(401)
    const newLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "crud_upd", password: "NewPassw0rd!" }),
    })
    expect(newLogin.status).toBe(200)
  })

  it("删除用户（库中消失）；禁止删除自己返回 400", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const user = await prisma.user.create({
      data: { username: "crud_del", passwordHash: await hashPassword("Passw0rd!"), nickname: "待删" },
    })
    const del = await app.request(`/api/users/${user.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    })
    expect(del.status).toBe(200)
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull()

    const self = await app.request(`/api/users/${adminId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    })
    expect(self.status).toBe(400)
    const selfBody = (await self.json()) as { message: string }
    expect(selfBody.message).toContain("自己")
  })

  it("分配角色 PUT：全量替换；详情返回已挂角色", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const user = await prisma.user.create({
      data: { username: "crud_roles", passwordHash: await hashPassword("Passw0rd!"), nickname: "角色分配" },
    })
    const res = await app.request(`/api/users/${user.id}/roles`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ roleIds: [adminRoleId] }),
    })
    expect(res.status).toBe(200)
    const detail = await app.request(`/api/users/${user.id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(detail.status).toBe(200)
    const body = (await detail.json()) as DetailBody
    expect(body.data.roles.map((r) => r.id)).toContain(adminRoleId)
  })
})
