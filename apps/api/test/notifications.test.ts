import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { z } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { createApp } from "../src/index.js"
import { hashPassword } from "@repo/db"
import { loginAs } from "./helpers.js"
import type { notificationItemSchema, notificationPageResultSchema, unreadCountSchema } from "../src/lib/schemas.js"

const SENDER_USERNAME = "notif_sender"
const RECEIVER_USERNAME = "notif_receiver"
const NO_PERM_USERNAME = "notif_noperm"
const PASSWORD = "Passw0rd!"

type NotificationItem = z.infer<typeof notificationItemSchema>
interface PageBody {
  data: z.infer<typeof notificationPageResultSchema>
}
interface UnreadBody {
  data: z.infer<typeof unreadCountSchema>
}

/** 按权限码查菜单，不存在则创建（permission 唯一索引：其他测试文件可能已建同码菜单，复用而非重建） */
async function upsertMenuByPermission(permission: string, parentId: string, nameZh: string): Promise<{ id: string }> {
  const existing = await prisma.menu.findUnique({ where: { permission } })
  if (existing) return existing
  return prisma.menu.create({ data: { nameZh, type: "BUTTON", permission, parentId, sort: 1 } })
}

describe("notifications", () => {
  beforeAll(async () => {
    // 发送方：notif_sender + NOTIF_ADMIN 角色（挂发送通知权限码）
    const sender = await prisma.user.create({
      data: { username: SENDER_USERNAME, passwordHash: await hashPassword(PASSWORD), nickname: "通知发送员" },
    })
    const role = await prisma.role.create({ data: { nameZh: "通知管理员", code: "NOTIF_ADMIN" } })
    const dir = await prisma.menu.create({ data: { nameZh: "系统管理", type: "DIR", icon: "Settings", sort: 1 } })
    const mNotif = await prisma.menu.create({
      data: { nameZh: "通知中心", type: "MENU", path: "/system/notification", component: "system/notifications", parentId: dir.id, sort: 8 },
    })
    const bSend = await upsertMenuByPermission("system:notification:create", mNotif.id, "发送通知")
    await prisma.roleMenu.createMany({
      data: [dir, mNotif, bSend].map((menu) => ({ roleId: role.id, menuId: menu.id })),
    })
    await prisma.userRole.create({ data: { userId: sender.id, roleId: role.id } })

    // 接收方：notif_receiver（空角色，仅验证收件与隔离）
    await prisma.user.create({
      data: { username: RECEIVER_USERNAME, passwordHash: await hashPassword(PASSWORD), nickname: "通知接收员" },
    })

    // 无权限用户：notif_noperm + 空角色（POST 创建 403；查询/已读类为个人数据仍可用）
    const noperm = await prisma.user.create({
      data: { username: NO_PERM_USERNAME, passwordHash: await hashPassword(PASSWORD), nickname: "无权限用户" },
    })
    const nopermRole = await prisma.role.create({ data: { nameZh: "无权限", code: "NOTIF_NOPERM" } })
    await prisma.userRole.create({ data: { userId: noperm.id, roleId: nopermRole.id } })
  })

  // 清理上个用例留下的 notif_crud_ 前缀通知与用户，避免测试间污染
  beforeEach(async () => {
    const crudUsers = await prisma.user.findMany({
      where: { username: { startsWith: "notif_crud" } },
      select: { id: true },
    })
    if (crudUsers.length > 0) {
      await prisma.notification.deleteMany({ where: { userId: { in: crudUsers.map((u) => u.id) } } })
    }
    await prisma.notification.deleteMany({
      where: { title: { startsWith: "notif_crud_" } },
    })
    await prisma.user.deleteMany({ where: { username: { startsWith: "notif_crud" } } })
  })

  it("未登录访问列表/未读数/已读接口返回 401", async () => {
    const app = createApp()
    expect((await app.request("/api/notifications")).status).toBe(401)
    expect((await app.request("/api/notifications/unread-count")).status).toBe(401)
    expect((await app.request("/api/notifications/some-id/read", { method: "PATCH" })).status).toBe(401)
    expect((await app.request("/api/notifications/read-all", { method: "PATCH" })).status).toBe(401)
  })

  it("接收方视角：创建后列表可见、未读数正确；已读后未读数减少", async () => {
    const app = createApp()
    const receiver = await prisma.user.create({
      data: { username: "notif_crud_r1", passwordHash: await hashPassword(PASSWORD), nickname: "收件人" },
    })
    await prisma.notification.createMany({
      data: [
        // 显式错开 createdAt（同事务 now() 相同会导致倒序不稳定）
        { userId: receiver.id, title: "notif_crud_a", content: "第一条", createdAt: new Date("2026-01-01T00:00:00Z") },
        { userId: receiver.id, title: "notif_crud_b", content: "第二条", isRead: true, readAt: new Date(), createdAt: new Date("2026-01-02T00:00:00Z") },
      ],
    })
    const token = await loginAs("notif_crud_r1", PASSWORD)
    const auth = { authorization: `Bearer ${token}` }

    const list = await app.request("/api/notifications?page=1&pageSize=10", { headers: auth })
    expect(list.status).toBe(200)
    const body = (await list.json()) as PageBody
    expect(body.data.total).toBe(2)
    expect(body.data.list).toHaveLength(2)
    // 倒序：后创建的在前
    expect(body.data.list[0]?.title).toBe("notif_crud_b")
    expect(body.data.list[1]?.title).toBe("notif_crud_a")

    const unread = await app.request("/api/notifications/unread-count", { headers: auth })
    expect(((await unread.json()) as UnreadBody).data.count).toBe(1)

    const unreadItem = body.data.list.find((item) => !item.isRead)
    // 前置数据断言：测试夹具保证存在未读通知（显式守卫收窄类型，no-non-null-assertion 禁用）
    if (!unreadItem) throw new Error("测试数据缺失未读通知")
    const read = await app.request(`/api/notifications/${unreadItem.id}/read`, { method: "PATCH", headers: auth })
    expect(read.status).toBe(200)
    const afterRead = (await (await app.request("/api/notifications/unread-count", { headers: auth })).json()) as UnreadBody
    expect(afterRead.data.count).toBe(0)
  })

  it("已读接口：标记他人通知 / 不存在的 id 返回 404", async () => {
    const app = createApp()
    const receiver = await prisma.user.create({
      data: { username: "notif_crud_r2", passwordHash: await hashPassword(PASSWORD), nickname: "收件人" },
    })
    const other = await prisma.user.create({
      data: { username: "notif_crud_other", passwordHash: await hashPassword(PASSWORD), nickname: "他人" },
    })
    const otherNotification = await prisma.notification.create({
      data: { userId: other.id, title: "notif_crud_other", content: "他人的通知" },
    })
    const token = await loginAs(receiver.username, PASSWORD)
    const auth = { authorization: `Bearer ${token}` }

    const cross = await app.request(`/api/notifications/${otherNotification.id}/read`, { method: "PATCH", headers: auth })
    expect(cross.status).toBe(404)
    const missing = await app.request("/api/notifications/no_such_id/read", { method: "PATCH", headers: auth })
    expect(missing.status).toBe(404)
  })

  it("read-all：全部标记已读并返回实际标记条数；重复调用返回 0", async () => {
    const app = createApp()
    const receiver = await prisma.user.create({
      data: { username: "notif_crud_r3", passwordHash: await hashPassword(PASSWORD), nickname: "收件人" },
    })
    await prisma.notification.createMany({
      data: [
        { userId: receiver.id, title: "notif_crud_a", content: "第一条" },
        { userId: receiver.id, title: "notif_crud_b", content: "第二条" },
      ],
    })
    const token = await loginAs("notif_crud_r3", PASSWORD)
    const auth = { authorization: `Bearer ${token}` }

    const res = await app.request("/api/notifications/read-all", { method: "PATCH", headers: auth })
    expect(res.status).toBe(200)
    expect(((await res.json()) as UnreadBody).data.count).toBe(2)
    expect(await prisma.notification.count({ where: { userId: receiver.id, isRead: false } })).toBe(0)
    // 全部已读后再调：0 条被标记
    const again = await app.request("/api/notifications/read-all", { method: "PATCH", headers: auth })
    expect(((await again.json()) as UnreadBody).data.count).toBe(0)
  })

  it("发送通知：管理员创建成功且接收方可见；接收用户不存在 404", async () => {
    const app = createApp()
    const token = await loginAs(SENDER_USERNAME, PASSWORD)
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }

    const receiver = await prisma.user.create({
      data: { username: "notif_crud_recv", passwordHash: await hashPassword(PASSWORD), nickname: "目标用户" },
    })
    const create = await app.request("/api/notifications", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ targetUserId: receiver.id, title: "notif_crud_send", content: "通知正文" }),
    })
    expect(create.status).toBe(200)
    const body = (await create.json()) as { data: NotificationItem }
    expect(body.data.title).toBe("notif_crud_send")
    expect(body.data.isRead).toBe(false)
    const stored = await prisma.notification.findUnique({ where: { id: body.data.id } })
    expect(stored?.userId).toBe(receiver.id)

    const missing = await app.request("/api/notifications", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ targetUserId: "no_such_user", title: "notif_crud_missing", content: "正文" }),
    })
    expect(missing.status).toBe(404)
    expect(((await missing.json()) as { code: string }).code).toBe("USER_NOT_FOUND")
  })

  it("权限与隔离：无权限用户 POST 403 且不落库；发送方看不到接收方的通知（个人数据隔离）", async () => {
    const app = createApp()
    const nopermToken = await loginAs(NO_PERM_USERNAME, PASSWORD)
    const nopermAuth = { "content-type": "application/json", authorization: `Bearer ${nopermToken}` }
    const receiver = await prisma.user.create({
      data: { username: "notif_crud_iso", passwordHash: await hashPassword(PASSWORD), nickname: "隔离目标" },
    })
    const create = await app.request("/api/notifications", {
      method: "POST",
      headers: nopermAuth,
      body: JSON.stringify({ targetUserId: receiver.id, title: "notif_crud_hack", content: "越权发送" }),
    })
    expect(create.status).toBe(403)
    expect(await prisma.notification.count({ where: { title: "notif_crud_hack" } })).toBe(0)

    // 无权限用户仍可查自己的通知（个人数据不依赖 RBAC）
    const list = await app.request("/api/notifications", { headers: { authorization: `Bearer ${nopermToken}` } })
    expect(list.status).toBe(200)

    // 隔离：发送方列表不含接收方通知
    const senderToken = await loginAs(SENDER_USERNAME, PASSWORD)
    const senderList = (await (await app.request("/api/notifications?pageSize=100", {
      headers: { authorization: `Bearer ${senderToken}` },
    })).json()) as PageBody
    expect(senderList.data.list.some((item) => item.title === "notif_crud_iso")).toBe(false)
  })
})
