import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { z } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { createApp } from "../src/index.js"
import { hashPassword } from "@repo/db"
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
  nameZh:string
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
    const role = await prisma.role.create({ data: { nameZh:"管理员", code: "ADMIN" } })
    adminRoleId = role.id
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })

    const dir = await prisma.menu.create({ data: { nameZh:"系统管理", type: "DIR", icon: "Settings", sort: 1 } })
    const mUser = await upsertMenu({
      nameZh:"用户管理",
      type: "MENU",
      permission: "system:user:query",
      path: "/system/user",
      component: "system/user",
      icon: "Users",
      parentId: dir.id,
      sort: 1,
    })
    const bCreate = await upsertMenu({
      nameZh:"用户新增",
      type: "BUTTON",
      permission: "system:user:create",
      parentId: mUser.id,
      sort: 1,
    })
    const bUpdate = await upsertMenu({
      nameZh:"用户编辑",
      type: "BUTTON",
      permission: "system:user:update",
      parentId: mUser.id,
      sort: 2,
    })
    const bDelete = await upsertMenu({
      nameZh:"用户删除",
      type: "BUTTON",
      permission: "system:user:delete",
      parentId: mUser.id,
      sort: 3,
    })
    const bAssign = await upsertMenu({
      nameZh:"分配角色",
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
    expect(dupBody.code).toBe("USERNAME_TAKEN")
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

  it("keyword 搜索：username 与 nickname 模糊匹配，total 正确", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const auth = { authorization: `Bearer ${token}` }
    const passwordHash = await hashPassword("Passw0rd!")
    await Promise.all([
      prisma.user.create({ data: { username: "crud_kw1", passwordHash, nickname: "关键词一号" } }),
      prisma.user.create({ data: { username: "crud_kw2", passwordHash, nickname: "关键词二号" } }),
      prisma.user.create({ data: { username: "crud_kw3", passwordHash, nickname: "唯一昵称" } }),
    ])
    // username 命中
    const byName = await app.request(`/api/users?page=1&pageSize=10&keyword=${encodeURIComponent("crud_kw2")}`, {
      headers: auth,
    })
    expect(byName.status).toBe(200)
    const nameBody = (await byName.json()) as PageBody
    expect(nameBody.data.total).toBe(1)
    expect(nameBody.data.list.map((u) => u.username)).toEqual(["crud_kw2"])
    // nickname 命中（keyword 也搜索 nickname）
    const byNick = await app.request(`/api/users?page=1&pageSize=10&keyword=${encodeURIComponent("唯一昵称")}`, {
      headers: auth,
    })
    expect(byNick.status).toBe(200)
    const nickBody = (await byNick.json()) as PageBody
    expect(nickBody.data.total).toBe(1)
    expect(nickBody.data.list.map((u) => u.nickname)).toEqual(["唯一昵称"])
  })

  it("重复 email / telephone 创建返回 409（字段级 message）", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }
    const base = { password: "Passw0rd!", nickname: "字段冲突" }
    const first = await app.request("/api/users", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ ...base, username: "crud_dup1", email: "crud_dup@example.com", telephone: "13800001111" }),
    })
    expect(first.status).toBe(200)
    // 大写 email 输入：小写化后仍与库中记录冲突（验证统一小写 + 唯一约束）
    const dupEmail = await app.request("/api/users", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ ...base, username: "crud_dup2", email: "CRUD_DUP@example.com" }),
    })
    const dupEmailBody = (await dupEmail.json()) as { code: string; message: string }
    expect(dupEmailBody.message).toContain("邮箱")
    expect(dupEmailBody.code).toBe("EMAIL_TAKEN")
    const dupPhone = await app.request("/api/users", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ ...base, username: "crud_dup3", telephone: "13800001111" }),
    })
    expect(dupPhone.status).toBe(409)
    const dupPhoneBody = (await dupPhone.json()) as { code: string; message: string }
    expect(dupPhoneBody.message).toContain("手机号")
    expect(dupPhoneBody.code).toBe("PHONE_TAKEN")
  })

  it("不存在的用户 id：GET/PATCH/DELETE 返回 404", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const auth = { authorization: `Bearer ${token}` }
    const missing = "no_such_user_id"
    const get = await app.request(`/api/users/${missing}`, { headers: auth })
    expect(get.status).toBe(404)
    const patch = await app.request(`/api/users/${missing}`, {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ nickname: "不存在" }),
    })
    expect(patch.status).toBe(404)
    const del = await app.request(`/api/users/${missing}`, { method: "DELETE", headers: auth })
    expect(del.status).toBe(404)
  })

  it("PUT roles 传入不存在的角色 id 返回 400", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const user = await prisma.user.create({
      data: { username: "crud_badrole", passwordHash: await hashPassword("Passw0rd!"), nickname: "坏角色" },
    })
    const res = await app.request(`/api/users/${user.id}/roles`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ roleIds: ["no_such_role"] }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { message: string }).message).toContain("角色")
  })

  it("pageSize 超过上限 100 返回 400", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const res = await app.request("/api/users?page=1&pageSize=101", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(400)
  })

  it("PUT roleIds 为空数组清空全部角色", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const user = await prisma.user.create({
      data: { username: "crud_clearrows", passwordHash: await hashPassword("Passw0rd!"), nickname: "清空角色" },
    })
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }
    const assign = await app.request(`/api/users/${user.id}/roles`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ roleIds: [adminRoleId] }),
    })
    expect(assign.status).toBe(200)
    const clear = await app.request(`/api/users/${user.id}/roles`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ roleIds: [] }),
    })
    expect(clear.status).toBe(200)
    const detail = await app.request(`/api/users/${user.id}`, { headers: { authorization: `Bearer ${token}` } })
    const body = (await detail.json()) as DetailBody
    expect(body.data.roles).toHaveLength(0)
  })

  it("PATCH email 传 null 清空邮箱（DB 值置空）", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const user = await prisma.user.create({
      data: {
        username: "crud_clear",
        passwordHash: await hashPassword("Passw0rd!"),
        nickname: "清空邮箱",
        email: "crud_clear@example.com",
      },
    })
    const res = await app.request(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: null }),
    })
    expect(res.status).toBe(200)
    const updated = await prisma.user.findUnique({ where: { id: user.id } })
    expect(updated?.email).toBeNull()
  })

  it("PATCH /users/me：修改个人资料（昵称/邮箱/手机号，无需 system:user:update 权限）", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const res = await app.request("/api/users/me", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: "管理员改", email: "Me@Example.com", telephone: "13900000000" }),
    })
    expect(res.status).toBe(200)
    const updated = await prisma.user.findUnique({ where: { username: "perm_admin" } })
    // email 统一小写写入
    expect(updated?.nickname).toBe("管理员改")
    expect(updated?.email).toBe("me@example.com")
    expect(updated?.telephone).toBe("13900000000")
  })

  it("PATCH /users/me：未登录 401；邮箱冲突 409", async () => {
    await prisma.user.create({
      data: {
        username: "me_holder",
        passwordHash: await hashPassword("Passw0rd!"),
        nickname: "占位",
        email: "me_holder@example.com",
      },
    })
    const app = createApp()
    const noAuth = await app.request("/api/users/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname: "x" }),
    })
    expect(noAuth.status).toBe(401)

    const token = await loginAdmin()
    const conflict = await app.request("/api/users/me", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: "me_holder@example.com" }),
    })
    expect(conflict.status).toBe(409)
    const conflictBody = (await conflict.json()) as { message: string }
    expect(conflictBody.message).toContain("邮箱")
  })
})
