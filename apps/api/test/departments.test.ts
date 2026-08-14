import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@repo/db"
import { hashPassword } from "@repo/db"
import { createApp } from "../src/index.js"
import { loginAs, upsertMenu } from "./helpers.js"
import type { departmentItemSchema } from "../src/lib/schemas.js"
import type { z } from "@hono/zod-openapi"

const ADMIN_USERNAME = "dept_admin"
const PASSWORD = "Passw0rd!"

type DepartmentItem = z.infer<typeof departmentItemSchema>

describe("departments CRUD", () => {
  beforeAll(async () => {
    // 管理员 + DEPT_ADMIN 角色（挂 system:dept:* + system:user:* 码）
    const admin = await prisma.user.create({
      data: { username: ADMIN_USERNAME, passwordHash: await hashPassword(PASSWORD), nickname: "部门管理员" },
    })
    const role = await prisma.role.create({ data: { nameZh: "部门管理员", code: "DEPT_ADMIN" } })
    const dir = await prisma.menu.create({ data: { nameZh: "系统管理", type: "DIR", icon: "Settings", sort: 1 } })
    const mDept = await upsertMenu({
      nameZh: "部门管理", type: "MENU", permission: "system:dept:query", path: "/system/department",
      component: "system/department", parentId: dir.id, sort: 9,
    })
    const bCreate = await upsertMenu({ nameZh: "部门新增", type: "BUTTON", permission: "system:dept:create", parentId: mDept.id, sort: 1 })
    const bUpdate = await upsertMenu({ nameZh: "部门编辑", type: "BUTTON", permission: "system:dept:update", parentId: mDept.id, sort: 2 })
    const bDelete = await upsertMenu({ nameZh: "部门删除", type: "BUTTON", permission: "system:dept:delete", parentId: mDept.id, sort: 3 })
    const mUser = await upsertMenu({
      nameZh: "用户管理", type: "MENU", permission: "system:user:query", path: "/system/user",
      component: "system/user", parentId: dir.id, sort: 1,
    })
    const bUserCreate = await upsertMenu({ nameZh: "用户新增", type: "BUTTON", permission: "system:user:create", parentId: mUser.id, sort: 1 })
    const bUserUpdate = await upsertMenu({ nameZh: "用户编辑", type: "BUTTON", permission: "system:user:update", parentId: mUser.id, sort: 2 })
    await prisma.roleMenu.createMany({
      data: [dir, mDept, bCreate, bUpdate, bDelete, mUser, bUserCreate, bUserUpdate].map((menu) => ({ roleId: role.id, menuId: menu.id })),
    })
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })
  })

  it("创建/查询：根部门 + 子部门，列表扁平返回且 userCount 正确", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, PASSWORD)
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }

    const root = await app.request("/api/departments", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ nameZh: "测试总部", nameEn: "HQ", sort: 1 }),
    })
    expect(root.status).toBe(200)
    const rootBody = (await root.json()) as { data: DepartmentItem }
    expect(rootBody.data.parentId).toBeNull()

    const child = await app.request("/api/departments", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ nameZh: "测试研发部", nameEn: "R&D", parentId: rootBody.data.id, sort: 1 }),
    })
    expect(child.status).toBe(200)
    const childBody = (await child.json()) as { data: DepartmentItem }
    expect(childBody.data.parentId).toBe(rootBody.data.id)

    // 用户挂到子部门 → 列表 userCount=1
    const user = await prisma.user.create({
      data: { username: "dept_member", passwordHash: await hashPassword(PASSWORD), nickname: "部门成员", departmentId: rootBody.data.id },
    })
    const list = await app.request("/api/departments", { headers: { authorization: `Bearer ${token}` } })
    const listBody = (await list.json()) as { data: DepartmentItem[] }
    expect(listBody.data.length).toBeGreaterThanOrEqual(2)
    const rootItem = listBody.data.find((d) => d.id === rootBody.data.id)
    expect(rootItem?.userCount).toBe(1)
    // 修复：此前误用 rootBody.data.id 又查了一次根部门，子部门的 nameEn 从未被真正断言（假阳性）
    const childItem = listBody.data.find((d) => d.id === childBody.data.id)
    expect(childItem).toBeDefined()
    expect(childItem?.nameEn).toBe("R&D")
    await prisma.user.delete({ where: { id: user.id } })
  })

  it("更新：改名/移动上级/挂到自身或后代 400；上级不存在 400", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, PASSWORD)
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }

    const parent = await prisma.department.create({ data: { nameZh: "dept_p_parent" } })
    const child = await prisma.department.create({ data: { nameZh: "dept_p_child", parentId: parent.id } })

    // 正常改名 + 移回根级
    const rename = await app.request(`/api/departments/${child.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ nameZh: "dept_p_child2", nameEn: "Child", parentId: null }),
    })
    expect(rename.status).toBe(200)
    expect(((await rename.json()) as { data: DepartmentItem }).data.parentId).toBeNull()

    // 挂到自身 → 400
    const selfLoop = await app.request(`/api/departments/${child.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ parentId: child.id }),
    })
    expect(selfLoop.status).toBe(400)
    // 上级不存在 → 400
    const badParent = await app.request(`/api/departments/${child.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ parentId: "no_such_dept" }),
    })
    expect(badParent.status).toBe(400)

    // 挂到父级 OK
    const toParent = await app.request(`/api/departments/${child.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ parentId: parent.id }),
    })
    expect(toParent.status).toBe(200)

    // 把父级挂到子级（循环：父→子→…）→ 400
    const cycle = await app.request(`/api/departments/${parent.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ parentId: child.id }),
    })
    expect(cycle.status).toBe(400)
  })

  it("删除：级联删子树；部门内用户保留并置空部门；不存在 404", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, PASSWORD)
    const auth = { authorization: `Bearer ${token}` }

    const parent = await prisma.department.create({ data: { nameZh: "dept_d_parent" } })
    const child = await prisma.department.create({ data: { nameZh: "dept_d_child", parentId: parent.id } })
    const user = await prisma.user.create({
      data: { username: "dept_d_member", passwordHash: await hashPassword(PASSWORD), nickname: "待迁成员", departmentId: child.id },
    })

    const del = await app.request(`/api/departments/${parent.id}`, { method: "DELETE", headers: auth })
    expect(del.status).toBe(200)
    expect(await prisma.department.count({ where: { id: { in: [parent.id, child.id] } } })).toBe(0)
    // 用户保留且部门置空
    const kept = await prisma.user.findUnique({ where: { id: user.id } })
    expect(kept?.nickname).toBe("待迁成员")
    expect(kept?.departmentId).toBeNull()

    const missing = await app.request("/api/departments/no_such_id", { method: "DELETE", headers: auth })
    expect(missing.status).toBe(404)
  })

  it("用户挂部门：创建/更新携带 departmentId，响应带 department 双名；部门不存在 400；null 清空", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, PASSWORD)
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }

    const dept = await prisma.department.create({ data: { nameZh: "dept_u_target", nameEn: "Target Dept" } })
    // 创建带部门
    const create = await app.request("/api/users", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ username: "dept_u_user1", password: "Passw0rd!", nickname: "挂部门用户", departmentId: dept.id }),
    })
    expect(create.status).toBe(200)
    const created = (await create.json()) as { data: { department: { id: string; nameZh: string; nameEn: string } | null } }
    expect(created.data.department?.id).toBe(dept.id)
    expect(created.data.department?.nameEn).toBe("Target Dept")

    // 部门不存在 → 400
    const badDept = await app.request("/api/users", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ username: "dept_u_bad", password: "Passw0rd!", nickname: "坏部门", departmentId: "no_such" }),
    })
    expect(badDept.status).toBe(400)

    // 更新清空部门 → null
    const userRecord = await prisma.user.findUnique({ where: { username: "dept_u_user1" } })
    // 前置断言（显式守卫收窄类型，no-non-null-assertion 禁用）
    if (!userRecord) throw new Error("测试用户不存在")
    const clear = await app.request(`/api/users/${userRecord.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ departmentId: null }),
    })
    expect(clear.status).toBe(200)
    expect(((await clear.json()) as { data: { department: unknown } }).data.department).toBeNull()
  })
})
