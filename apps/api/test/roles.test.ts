import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { z } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { createApp } from "../src/index.js"
import { hashPassword } from "@repo/db"
import type { roleListItemSchema, rolePageResultSchema } from "../src/lib/schemas.js"

const ADMIN_USERNAME = "roles_admin"
const ADMIN_PASSWORD = "Passw0rd!"

interface PageBody {
  data: z.infer<typeof rolePageResultSchema>
}
type RoleItem = z.infer<typeof roleListItemSchema>
interface ListBody {
  data: RoleItem[]
}

// beforeAll 建的记录 id（测试间复用）；用户名/角色码与 users.test.ts（perm_admin/ADMIN）错开，保证执行顺序无关
let dirId: string
let roleMenuId: string
let bCreateId: string
let bUpdateId: string
let bDeleteId: string
let bAssignId: string

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

describe("roles CRUD", () => {
  beforeAll(async () => {
    // 管理员：roles_admin + ROLES_ADMIN 角色；菜单树按权限码复用/补齐（Task 13 seed 前菜单表为空，须自建才有 system:role:* 码）
    const admin = await prisma.user.create({
      data: { username: ADMIN_USERNAME, passwordHash: await hashPassword(ADMIN_PASSWORD), nickname: "角色管理员" },
    })
    const role = await prisma.role.create({ data: { name: "角色管理员", code: "ROLES_ADMIN" } })
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })

    const dir = await prisma.menu.create({ data: { name: "系统管理", type: "DIR", icon: "Settings", sort: 1 } })
    dirId = dir.id
    const mRole = await upsertMenu({
      name: "角色管理",
      type: "MENU",
      permission: "system:role:query",
      path: "/system/role",
      component: "system/role",
      icon: "UserCog",
      parentId: dir.id,
      sort: 2,
    })
    roleMenuId = mRole.id
    const bCreate = await upsertMenu({
      name: "角色新增",
      type: "BUTTON",
      permission: "system:role:create",
      parentId: mRole.id,
      sort: 1,
    })
    bCreateId = bCreate.id
    const bUpdate = await upsertMenu({
      name: "角色编辑",
      type: "BUTTON",
      permission: "system:role:update",
      parentId: mRole.id,
      sort: 2,
    })
    bUpdateId = bUpdate.id
    const bDelete = await upsertMenu({
      name: "角色删除",
      type: "BUTTON",
      permission: "system:role:delete",
      parentId: mRole.id,
      sort: 3,
    })
    bDeleteId = bDelete.id
    const bAssign = await upsertMenu({
      name: "分配权限",
      type: "BUTTON",
      permission: "system:role:assign",
      parentId: mRole.id,
      sort: 4,
    })
    bAssignId = bAssign.id
    await prisma.roleMenu.createMany({
      data: [dir, mRole, bCreate, bUpdate, bDelete, bAssign].map((menu) => ({
        roleId: role.id,
        menuId: menu.id,
      })),
    })
  })

  // 清理上个用例留下的 role_crud_ 角色/用户（含关联表，级联），避免测试间污染；
  // SQLite LIKE 对 ASCII 大小写不敏感且 _ 为通配符，故前缀用 ROLE_CRUD_ 与管理员码 ROLES_ADMIN 严格区分
  beforeEach(async () => {
    await prisma.role.deleteMany({ where: { code: { startsWith: "ROLE_CRUD_" } } })
    await prisma.user.deleteMany({ where: { username: { startsWith: "role_crud" } } })
  })

  it("创建角色：code 统一转大写存储；重复 code（不同大小写）409 且 message 含“角色编码”", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const create = await app.request("/api/roles", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "测试角色", nameEn: "Test Role", code: "Test_Role", sort: 1 }),
    })
    expect(create.status).toBe(200)
    const body = (await create.json()) as { data: RoleItem }
    expect(body.data.name).toBe("测试角色")
    expect(body.data.nameEn).toBe("Test Role")
    expect(body.data.code).toBe("TEST_ROLE")
    expect(body.data.sort).toBe(1)
    const stored = await prisma.role.findUnique({ where: { code: "TEST_ROLE" } })
    expect(stored?.name).toBe("测试角色")
    expect(stored?.nameEn).toBe("Test Role")

    const dup = await app.request("/api/roles", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "重复", code: "test_role", sort: 2 }),
    })
    expect(dup.status).toBe(409)
    const dupBody = (await dup.json()) as { message: string }
    expect(dupBody.message).toContain("角色编码")
  })

  it("菜单授权：PUT 全量提交（含 DIR/MENU/BUTTON 混合）+ GET 回显一致；不存在的菜单 id 返回 400", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }
    const role = await prisma.role.create({ data: { name: "授权角色", code: "ROLE_CRUD_GRANT" } })
    const menuIds = [dirId, roleMenuId, bCreateId, bUpdateId, bDeleteId, bAssignId]
    const put = await app.request(`/api/roles/${role.id}/menus`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ menuIds }),
    })
    expect(put.status).toBe(200)
    const get = await app.request(`/api/roles/${role.id}/menus`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(get.status).toBe(200)
    const body = (await get.json()) as { data: { menuIds: string[] } }
    expect(body.data.menuIds.sort()).toEqual([...menuIds].sort())
    // 回显含按钮节点（授权提交时允许勾选 BUTTON）
    expect(body.data.menuIds).toEqual(expect.arrayContaining([bCreateId, bAssignId]))

    const bad = await app.request(`/api/roles/${role.id}/menus`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ menuIds: ["no_such_menu"] }),
    })
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { message: string }).message).toContain("菜单")
  })

  it("删除角色：UserRole 级联清理、用户不受影响；不存在的 id GET/PATCH/DELETE 返回 404", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const auth = { authorization: `Bearer ${token}` }
    const role = await prisma.role.create({ data: { name: "待删角色", code: "ROLE_CRUD_DEL" } })
    const user = await prisma.user.create({
      data: { username: "role_crud_del_user", passwordHash: await hashPassword("Passw0rd!"), nickname: "挂角色用户" },
    })
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })
    const del = await app.request(`/api/roles/${role.id}`, { method: "DELETE", headers: auth })
    expect(del.status).toBe(200)
    expect(await prisma.role.findUnique({ where: { id: role.id } })).toBeNull()
    expect(await prisma.userRole.count({ where: { userId: user.id } })).toBe(0)
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1)

    const missing = "no_such_role_id"
    const get = await app.request(`/api/roles/${missing}`, { headers: auth })
    expect(get.status).toBe(404)
    const patch = await app.request(`/api/roles/${missing}`, {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ name: "不存在" }),
    })
    expect(patch.status).toBe(404)
    const delMissing = await app.request(`/api/roles/${missing}`, { method: "DELETE", headers: auth })
    expect(delMissing.status).toBe(404)
  })

  it("更新角色：PATCH 改名/禁用/清空描述/改 code（小写输入转大写存储）；code 撞已存在角色 409 不落库", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }
    const role = await prisma.role.create({
      data: { name: "旧名", code: "ROLE_CRUD_PATCH1", description: "原始描述", sort: 1 },
    })
    const res = await app.request(`/api/roles/${role.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ name: "新名", nameEn: "New En Name", status: false, description: null, code: "role_crud_patch2" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: RoleItem }
    expect(body.data.name).toBe("新名")
    expect(body.data.nameEn).toBe("New En Name")
    expect(body.data.code).toBe("ROLE_CRUD_PATCH2")
    expect(body.data.status).toBe(false)
    expect(body.data.description).toBeNull()
    const stored = await prisma.role.findUnique({ where: { id: role.id } })
    expect(stored?.name).toBe("新名")
    expect(stored?.nameEn).toBe("New En Name")
    expect(stored?.code).toBe("ROLE_CRUD_PATCH2")
    expect(stored?.status).toBe(false)
    expect(stored?.description).toBeNull()

    // PATCH code 撞已存在角色（大小写变体同约束）→ 409，且目标角色编码不落库
    const other = await prisma.role.create({ data: { name: "冲突目标", code: "ROLE_CRUD_PATCH3" } })
    const dup = await app.request(`/api/roles/${other.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ code: "role_crud_patch2" }),
    })
    expect(dup.status).toBe(409)
    expect(((await dup.json()) as { message: string }).message).toContain("角色编码")
    expect((await prisma.role.findUnique({ where: { id: other.id } }))?.code).toBe("ROLE_CRUD_PATCH3")
  })

  it("菜单授权边界：重复 menuId 去重、空数组清空、超大数组 400、不存在角色 GET/PUT 404", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }
    const role = await prisma.role.create({ data: { name: "边界角色", code: "ROLE_CRUD_EDGE" } })
    // 重复 menuId：Set 去重后落库（回显仅 1 个）
    const put = await app.request(`/api/roles/${role.id}/menus`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ menuIds: [roleMenuId, roleMenuId, bCreateId] }),
    })
    expect(put.status).toBe(200)
    const echo = await app.request(`/api/roles/${role.id}/menus`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(echo.status).toBe(200)
    expect(((await echo.json()) as { data: { menuIds: string[] } }).data.menuIds.sort()).toEqual(
      [bCreateId, roleMenuId].sort(),
    )
    // 空数组：清空全部授权
    const clear = await app.request(`/api/roles/${role.id}/menus`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ menuIds: [] }),
    })
    expect(clear.status).toBe(200)
    const after = await app.request(`/api/roles/${role.id}/menus`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(((await after.json()) as { data: { menuIds: string[] } }).data.menuIds).toHaveLength(0)
    // 超大 payload：menuIds 超过 500 上限 → 400（zod max 分支）
    const overflow = await app.request(`/api/roles/${role.id}/menus`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ menuIds: Array.from({ length: 501 }, (_, i) => `m${String(i)}`) }),
    })
    expect(overflow.status).toBe(400)
    // 不存在的角色：menus GET/PUT 404
    const missing = "no_such_role_id"
    const get = await app.request(`/api/roles/${missing}/menus`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(get.status).toBe(404)
    const putMissing = await app.request(`/api/roles/${missing}/menus`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ menuIds: [] }),
    })
    expect(putMissing.status).toBe(404)
  })

  it("pageSize 超过上限 100 返回 400", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const res = await app.request("/api/roles?page=1&pageSize=101", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(400)
  })

  it("分页列表：page/pageSize 生效、total 正确；keyword 匹配 name 与 code", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const auth = { authorization: `Bearer ${token}` }
    await Promise.all([
      prisma.role.create({ data: { name: "关键词一号", code: "ROLE_CRUD_KW1", sort: 1 } }),
      prisma.role.create({ data: { name: "关键词二号", code: "ROLE_CRUD_KW2", sort: 2 } }),
      prisma.role.create({ data: { name: "唯一角色", code: "ROLE_CRUD_KW3", sort: 3 } }),
    ])
    const page = await app.request("/api/roles?page=1&pageSize=2", { headers: auth })
    expect(page.status).toBe(200)
    const pageBody = (await page.json()) as PageBody
    expect(pageBody.data.list).toHaveLength(2)
    expect(pageBody.data.total).toBeGreaterThanOrEqual(3)
    // keyword 命中 code
    const byCode = await app.request(
      `/api/roles?page=1&pageSize=10&keyword=${encodeURIComponent("ROLE_CRUD_KW2")}`,
      { headers: auth },
    )
    expect(byCode.status).toBe(200)
    const codeBody = (await byCode.json()) as PageBody
    expect(codeBody.data.total).toBe(1)
    expect(codeBody.data.list.map((r) => r.code)).toEqual(["ROLE_CRUD_KW2"])
    // keyword 命中 name
    const byName = await app.request(`/api/roles?page=1&pageSize=10&keyword=${encodeURIComponent("唯一角色")}`, {
      headers: auth,
    })
    expect(byName.status).toBe(200)
    const nameBody = (await byName.json()) as PageBody
    expect(nameBody.data.total).toBe(1)
    expect(nameBody.data.list.map((r) => r.name)).toEqual(["唯一角色"])
  })

  it("GET /roles/list：全量返回（无分页、含管理员角色），供下拉使用", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const auth = { authorization: `Bearer ${token}` }
    await prisma.role.create({ data: { name: "下拉角色一", code: "ROLE_CRUD_LIST1", sort: 5 } })
    await prisma.role.create({ data: { name: "下拉角色二", code: "ROLE_CRUD_LIST2", sort: 6 } })
    const res = await app.request("/api/roles/list", { headers: auth })
    expect(res.status).toBe(200)
    const body = (await res.json()) as ListBody
    const codes = body.data.map((r) => r.code)
    expect(codes).toContain("ROLE_CRUD_LIST1")
    expect(codes).toContain("ROLE_CRUD_LIST2")
    expect(codes).toContain("ROLES_ADMIN")
    expect(body.data.length).toBe(await prisma.role.count())
  })
})
