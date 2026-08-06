import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@repo/db"
import type { MenuNode } from "@repo/shared"
import { createApp } from "../src/index.js"
import { hashPassword } from "../src/lib/password.js"

const ADMIN_USERNAME = "menus_admin"
const ADMIN_PASSWORD = "Passw0rd!"

// beforeAll 建的记录 id（测试间复用）；用户名/角色码与其他测试文件错开，保证执行顺序无关
let dirId: string
let menuId: string
let bCreateId: string
let bUpdateId: string
let bDeleteId: string

/** 按权限码查菜单，不存在则创建（permission 唯一索引：其他测试文件/seed 可能已建同码菜单，复用而非重建） */
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

describe("menus CRUD", () => {
  beforeAll(async () => {
    // 管理员：menus_admin + MENUS_ADMIN 角色；菜单树按权限码复用/补齐（Task 13 seed 前菜单表为空，须自建才有 system:menu:* 码）
    const admin = await prisma.user.create({
      data: { username: ADMIN_USERNAME, passwordHash: await hashPassword(ADMIN_PASSWORD), nickname: "菜单管理员" },
    })
    const role = await prisma.role.create({ data: { name: "菜单管理员", code: "MENUS_ADMIN" } })
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })

    const dir = await prisma.menu.create({ data: { name: "菜单测试目录", type: "DIR", icon: "Folder", sort: 1 } })
    dirId = dir.id
    const mQuery = await upsertMenu({
      name: "菜单管理",
      type: "MENU",
      permission: "system:menu:query",
      path: "/system/menu",
      component: "system/menu",
      icon: "MenuSquare",
      parentId: dir.id,
      sort: 2,
    })
    menuId = mQuery.id
    const bCreate = await upsertMenu({
      name: "菜单新增",
      type: "BUTTON",
      permission: "system:menu:create",
      parentId: mQuery.id,
      sort: 1,
    })
    bCreateId = bCreate.id
    const bUpdate = await upsertMenu({
      name: "菜单编辑",
      type: "BUTTON",
      permission: "system:menu:update",
      parentId: mQuery.id,
      sort: 2,
    })
    bUpdateId = bUpdate.id
    const bDelete = await upsertMenu({
      name: "菜单删除",
      type: "BUTTON",
      permission: "system:menu:delete",
      parentId: mQuery.id,
      sort: 3,
    })
    bDeleteId = bDelete.id
    await prisma.roleMenu.createMany({
      data: [dir, mQuery, bCreate, bUpdate, bDelete].map((menu) => ({
        roleId: role.id,
        menuId: menu.id,
      })),
    })
  })

  // 清理上个用例建的测试菜单（名称统一 MENU_CRUD_ 前缀，避免与其他文件/seed 的菜单混淆）
  beforeEach(async () => {
    await prisma.menu.deleteMany({ where: { name: { startsWith: "MENU_CRUD_" } } })
  })

  it("菜单树：GET /api/menus/tree 返回全量树（DIR 含 children、BUTTON 挂在 MENU 下、同层按 sort 升序）", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const res = await app.request("/api/menus/tree", { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: MenuNode[] }
    expect(Array.isArray(body.data)).toBe(true)
    // id 定位 beforeAll 建的节点（名称/总数不依赖其他测试文件的菜单）
    const root = body.data.find((n) => n.id === dirId)
    expect(root?.type).toBe("DIR")
    const menu = root?.children.find((n) => n.id === menuId)
    expect(menu?.type).toBe("MENU")
    // BUTTON 挂在 MENU 下，同层按 sort 升序
    expect(menu?.children.map((n) => n.id)).toEqual([bCreateId, bUpdateId, bDeleteId])
  })

  it("类型约束：MENU 下挂 DIR 400、MENU 下挂 BUTTON 200、DIR 下挂 MENU 200、BUTTON 下挂子节点 400；MENU 缺 path/component 400；BUTTON 带 path/无父 400", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }
    const post = (body: Record<string, unknown>) =>
      app.request("/api/menus", { method: "POST", headers: auth, body: JSON.stringify(body) })

    // MENU 下挂 DIR → 400（MENU 只能挂 BUTTON）
    expect((await post({ name: "MENU_CRUD_非法目录", type: "DIR", parentId: menuId })).status).toBe(400)
    // MENU 下挂 BUTTON → 200
    const btn = await post({ name: "MENU_CRUD_按钮", type: "BUTTON", parentId: menuId, permission: "menu_crud_btn" })
    expect(btn.status).toBe(200)
    const btnId = ((await btn.json()) as { data: MenuNode }).data.id
    // BUTTON 下挂子节点 → 400（BUTTON 无子级）
    expect((await post({ name: "MENU_CRUD_按钮之子", type: "DIR", parentId: btnId })).status).toBe(400)
    // DIR 下挂 MENU → 200
    const m1 = await post({
      name: "MENU_CRUD_菜单A",
      type: "MENU",
      parentId: dirId,
      path: "/a",
      component: "a",
      permission: "menu_crud_m1",
    })
    expect(m1.status).toBe(200)
    // MENU 缺 path → 400
    expect((await post({ name: "MENU_CRUD_缺路径", type: "MENU", parentId: dirId, component: "x" })).status).toBe(400)
    // MENU 缺 component → 400
    expect((await post({ name: "MENU_CRUD_缺组件", type: "MENU", parentId: dirId, path: "/x" })).status).toBe(400)
    // BUTTON 带 path → 400
    expect((await post({ name: "MENU_CRUD_带路径按钮", type: "BUTTON", parentId: menuId, path: "/x" })).status).toBe(400)
    // BUTTON 无父（不能是根）→ 400；根可为 DIR/MENU（Dashboard 是 MENU 根）
    expect((await post({ name: "MENU_CRUD_根按钮", type: "BUTTON" })).status).toBe(400)
    expect((await post({ name: "MENU_CRUD_根目录", type: "DIR" })).status).toBe(200)
    expect(
      (await post({ name: "MENU_CRUD_根菜单", type: "MENU", path: "/root", component: "root", permission: "menu_crud_root_menu" }))
        .status,
    ).toBe(200)
  })

  it("权限码唯一：重复 permission 409 且 message 含“权限码”；空 permission（不传）可重复", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }
    const post = (body: Record<string, unknown>) =>
      app.request("/api/menus", { method: "POST", headers: auth, body: JSON.stringify(body) })

    const first = await post({
      name: "MENU_CRUD_唯一1",
      type: "MENU",
      parentId: dirId,
      path: "/p1",
      component: "p1",
      permission: "menu_crud_uniq",
    })
    expect(first.status).toBe(200)
    const dup = await post({
      name: "MENU_CRUD_唯一2",
      type: "MENU",
      parentId: dirId,
      path: "/p2",
      component: "p2",
      permission: "menu_crud_uniq",
    })
    expect(dup.status).toBe(409)
    expect(((await dup.json()) as { message: string }).message).toContain("权限码")
    // 空 permission 可重复（可空 unique，三方言允许多个 NULL）
    expect((await post({ name: "MENU_CRUD_空码1", type: "MENU", parentId: dirId, path: "/e1", component: "e1" })).status).toBe(200)
    expect((await post({ name: "MENU_CRUD_空码2", type: "MENU", parentId: dirId, path: "/e2", component: "e2" })).status).toBe(200)
  })

  it("防自挂：PATCH parentId 改到自己/子孙 400、改到合法父/根 200；父不存在 400；不存在的 id 404", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }
    const patch = (id: string, body: Record<string, unknown>) =>
      app.request(`/api/menus/${id}`, { method: "PATCH", headers: auth, body: JSON.stringify(body) })
    // 两层子树：dirA → dirB → menuC（menuC 挂 dirB 下）
    const dirA = await prisma.menu.create({ data: { name: "MENU_CRUD_祖父", type: "DIR", sort: 1 } })
    const dirB = await prisma.menu.create({ data: { name: "MENU_CRUD_父", type: "DIR", parentId: dirA.id, sort: 1 } })
    const menuC = await prisma.menu.create({
      data: {
        name: "MENU_CRUD_子",
        type: "MENU",
        parentId: dirB.id,
        path: "/c",
        component: "c",
        permission: "menu_crud_self_c",
        sort: 1,
      },
    })
    // 改到自己 → 400
    expect((await patch(dirA.id, { parentId: dirA.id })).status).toBe(400)
    // 改到自己的子孙（直接子节点 dirB、孙节点 menuC）→ 400
    expect((await patch(dirA.id, { parentId: dirB.id })).status).toBe(400)
    expect((await patch(dirA.id, { parentId: menuC.id })).status).toBe(400)
    // 新父不存在 → 400
    expect((await patch(dirB.id, { parentId: "no_such_parent" })).status).toBe(400)
    // 改到合法父节点 → 200
    const other = await prisma.menu.create({ data: { name: "MENU_CRUD_新父", type: "DIR" } })
    const ok = await patch(dirB.id, { parentId: other.id })
    expect(ok.status).toBe(200)
    expect((await prisma.menu.findUnique({ where: { id: dirB.id } }))?.parentId).toBe(other.id)
    // 改到根（parentId: null）→ 200
    const toRoot = await patch(dirB.id, { parentId: null })
    expect(toRoot.status).toBe(200)
    expect((await prisma.menu.findUnique({ where: { id: dirB.id } }))?.parentId).toBeNull()
    // 不存在的 id → 404
    expect((await patch("no_such_menu_id", { name: "不存在" })).status).toBe(404)
  })

  it("级联删除：删 DIR 整棵子树消失 + RoleMenu 关联清理；不存在的 id 404", async () => {
    const app = createApp()
    const token = await loginAdmin()
    const auth = { authorization: `Bearer ${token}` }
    // 建 DIR → MENU → BUTTON 三层
    const dir = await prisma.menu.create({ data: { name: "MENU_CRUD_级联目录", type: "DIR" } })
    const menu = await prisma.menu.create({
      data: {
        name: "MENU_CRUD_级联菜单",
        type: "MENU",
        parentId: dir.id,
        path: "/cascade",
        component: "cascade",
        permission: "menu_crud_cas_m",
      },
    })
    const btn = await prisma.menu.create({
      data: { name: "MENU_CRUD_级联按钮", type: "BUTTON", parentId: menu.id, permission: "menu_crud_cas_b" },
    })
    // 挂一个角色授权整棵子树（验证 RoleMenu 关联清理）
    const role = await prisma.role.create({ data: { name: "级联角色", code: "MENU_CRUD_CAS_ROLE" } })
    await prisma.roleMenu.createMany({ data: [dir, menu, btn].map((m) => ({ roleId: role.id, menuId: m.id })) })
    expect(await prisma.roleMenu.count({ where: { roleId: role.id } })).toBe(3)

    const del = await app.request(`/api/menus/${dir.id}`, { method: "DELETE", headers: auth })
    expect(del.status).toBe(200)
    expect(await prisma.menu.count({ where: { id: { in: [dir.id, menu.id, btn.id] } } })).toBe(0)
    expect(await prisma.roleMenu.count({ where: { roleId: role.id } })).toBe(0)
    // 角色本身保留（菜单删除不影响角色）
    expect(await prisma.role.count({ where: { id: role.id } })).toBe(1)

    // 不存在的 id → 404
    const missing = await app.request("/api/menus/no_such_menu_id", { method: "DELETE", headers: auth })
    expect(missing.status).toBe(404)
  })
})
