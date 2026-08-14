import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@repo/db"
import { hashPassword } from "@repo/db"
import { createApp } from "../src/index.js"
import { loginAs, upsertMenu } from "./helpers.js"

const ADMIN_USERNAME = "ann_admin"
const NO_PERM_USERNAME = "ann_noperm"
const PASSWORD = "Passw0rd!"

describe("announcements CRUD", () => {
  beforeAll(async () => {
    // 管理员 + ANN_ADMIN 角色（挂 system:announcement:* 码）
    const admin = await prisma.user.create({
      data: { username: ADMIN_USERNAME, passwordHash: await hashPassword(PASSWORD), nickname: "公告管理员" },
    })
    const role = await prisma.role.create({ data: { nameZh: "公告管理员", code: "ANN_ADMIN" } })
    const dir = await prisma.menu.create({ data: { nameZh: "系统管理", type: "DIR", icon: "Settings", sort: 1 } })
    const mAnn = await upsertMenu({
      nameZh: "公告管理", type: "MENU", permission: "system:announcement:query", path: "/system/announcement",
      component: "system/announcement", parentId: dir.id, sort: 10,
    })
    const bCreate = await upsertMenu({ nameZh: "公告新增", type: "BUTTON", permission: "system:announcement:create", parentId: mAnn.id, sort: 1 })
    const bUpdate = await upsertMenu({ nameZh: "公告编辑", type: "BUTTON", permission: "system:announcement:update", parentId: mAnn.id, sort: 2 })
    const bDelete = await upsertMenu({ nameZh: "公告删除", type: "BUTTON", permission: "system:announcement:delete", parentId: mAnn.id, sort: 3 })
    await prisma.roleMenu.createMany({
      data: [dir, mAnn, bCreate, bUpdate, bDelete].map((menu) => ({ roleId: role.id, menuId: menu.id })),
    })
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })

    // 无权限用户（管理接口 403；latest 为全员接口仍可用）
    const noperm = await prisma.user.create({
      data: { username: NO_PERM_USERNAME, passwordHash: await hashPassword(PASSWORD), nickname: "无权限" },
    })
    const nopermRole = await prisma.role.create({ data: { nameZh: "无权限", code: "ANN_NOPERM" } })
    await prisma.userRole.create({ data: { userId: noperm.id, roleId: nopermRole.id } })
  })

  beforeEach(async () => {
    await prisma.announcement.deleteMany({ where: { title: { startsWith: "ann_crud_" } } })
  })

  it("创建/分页/更新/删除：status 默认发布；下架后 latest 不返回", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, PASSWORD)
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }

    // 创建（默认发布）
    const create = await app.request("/api/announcements", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ title: "ann_crud_1", content: "第一条公告正文" }),
    })
    expect(create.status).toBe(200)
    const created = (await create.json()) as { data: { id: string; title: string; status: boolean } }
    expect(created.data.status).toBe(true)

    // latest 返回最新已发布
    const latest = await app.request("/api/announcements/latest", { headers: { authorization: `Bearer ${token}` } })
    expect(((await latest.json()) as { data: { title: string } }).data.title).toBe("ann_crud_1")

    // 更新：改名 + 下架
    const update = await app.request(`/api/announcements/${created.data.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ title: "ann_crud_1x", status: false }),
    })
    expect(update.status).toBe(200)
    expect(((await update.json()) as { data: { status: boolean } }).data.status).toBe(false)

    // 下架后 latest 返回 null（无其他已发布公告时）
    const after = await app.request("/api/announcements/latest", { headers: { authorization: `Bearer ${token}` } })
    expect(((await after.json()) as { data: unknown }).data).toBeNull()

    // 分页列表可见（管理接口返回全部，含下架）
    const page = await app.request("/api/announcements?page=1&pageSize=10", { headers: { authorization: `Bearer ${token}` } })
    expect(page.status).toBe(200)
    const pageBody = (await page.json()) as { data: { list: { id: string }[]; total: number } }
    expect(pageBody.data.list.some((item) => item.id === created.data.id)).toBe(true)

    // 删除
    const del = await app.request(`/api/announcements/${created.data.id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } })
    expect(del.status).toBe(200)
    expect(await prisma.announcement.findUnique({ where: { id: created.data.id } })).toBeNull()
    // 删除不存在的 → 404
    expect((await app.request("/api/announcements/no_such_id", { method: "DELETE", headers: { authorization: `Bearer ${token}` } })).status).toBe(404)
  })

  it("latest 排序：仅取已发布中 createdAt 最新的一条", async () => {
    // 用 prisma 直插并显式指定 createdAt，避免毫秒级时间戳并列导致排序不确定
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, PASSWORD)
    const auth = { authorization: `Bearer ${token}` }
    const base = Date.now()
    const older = await prisma.announcement.create({
      data: { title: "ann_crud_older", content: "旧公告", createdAt: new Date(base - 60_000) },
    })
    const newer = await prisma.announcement.create({
      data: { title: "ann_crud_newer", content: "新公告", createdAt: new Date(base) },
    })
    // 未发布但 createdAt 更晚：不参与 latest
    await prisma.announcement.create({
      data: { title: "ann_crud_unpub", content: "未发布", status: false, createdAt: new Date(base + 60_000) },
    })

    const latest = await app.request("/api/announcements/latest", { headers: auth })
    expect(latest.status).toBe(200)
    const body = (await latest.json()) as { data: { id: string; title: string } | null }
    expect(body.data?.id).toBe(newer.id)
    expect(body.data?.title).toBe("ann_crud_newer")
    // 清理（ann_crud_ 前缀，下个用例的 beforeEach 也会清）
    await prisma.announcement.deleteMany({
      where: { id: { in: [older.id, newer.id] } },
    })
  })

  it("权限：管理接口无权限 403；latest 全员可用（无权限用户 200）", async () => {
    const app = createApp()
    const nopermToken = await loginAs(NO_PERM_USERNAME, PASSWORD)
    const nopermAuth = { "content-type": "application/json", authorization: `Bearer ${nopermToken}` }

    const list = await app.request("/api/announcements", { headers: nopermAuth })
    expect(list.status).toBe(403)
    const create = await app.request("/api/announcements", {
      method: "POST",
      headers: nopermAuth,
      body: JSON.stringify({ title: "ann_crud_hack", content: "越权" }),
    })
    expect(create.status).toBe(403)
    expect(await prisma.announcement.count({ where: { title: "ann_crud_hack" } })).toBe(0)
    // latest 不挂权限码
    const latest = await app.request("/api/announcements/latest", { headers: nopermAuth })
    expect(latest.status).toBe(200)
  })
})
