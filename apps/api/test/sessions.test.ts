import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { z } from "@hono/zod-openapi"
import { hashPassword, prisma } from "@repo/db"
import { createApp } from "../src/index.js"
import { loginAs, upsertMenu } from "./helpers.js"
import type { sessionPageResultSchema } from "../src/lib/schemas.js"
import { hashToken } from "../src/lib/tokens.js"

const ADMIN_USERNAME = "session_admin"
const ADMIN_PASSWORD = "Passw0rd!"

interface PageBody {
  data: z.infer<typeof sessionPageResultSchema>
}
interface TokenBody {
  data: { accessToken: string; refreshToken: string }
}

// beforeAll 建的菜单 id（测试间复用）
let sessionQueryMenuId: string

function loginRequest(
  app: ReturnType<typeof createApp>,
  username: string,
  password: string,
  extraHeaders: Record<string, string> = {},
) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify({ username, password }),
  })
}

function refreshRequest(app: ReturnType<typeof createApp>, refreshToken: string) {
  return app.request("/api/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  })
}

describe("sessions", () => {
  beforeAll(async () => {
    // 管理员：session_admin + ADMIN 角色；会话管理菜单按权限码复用/补齐（测试库重建后为空，须自建才有 system:session:* 码）
    const admin = await prisma.user.create({
      data: { username: ADMIN_USERNAME, passwordHash: await hashPassword(ADMIN_PASSWORD), nickname: "管理员" },
    })
    const role = await prisma.role.create({ data: { nameZh: "管理员", code: "ADMIN" } })
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })

    const dir = await prisma.menu.create({ data: { nameZh: "系统管理", type: "DIR", icon: "Settings", sort: 1 } })
    const mSession = await upsertMenu({
      nameZh: "会话管理",
      type: "MENU",
      permission: "system:session:query",
      path: "/system/session",
      component: "system/session",
      icon: "Monitor",
      parentId: dir.id,
      sort: 1,
    })
    sessionQueryMenuId = mSession.id
    const bRevoke = await upsertMenu({
      nameZh: "强制下线",
      type: "BUTTON",
      permission: "system:session:revoke",
      parentId: mSession.id,
      sort: 1,
    })
    await prisma.roleMenu.createMany({
      data: [dir, mSession, bRevoke].map((menu) => ({ roleId: role.id, menuId: menu.id })),
    })
  })

  // 清理上个用例留下的 stest_ 用户（含其会话与关联，级联），避免测试间污染
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: "stest_" } } })
  })

  it("登录产生在线会话：GET /api/sessions 返回含 ip/userAgent 的条目", async () => {
    const app = createApp()
    const loginRes = await loginRequest(app, ADMIN_USERNAME, ADMIN_PASSWORD, {
      "x-forwarded-for": "203.0.113.42",
      "user-agent": "sess-ua-test",
    })
    expect(loginRes.status).toBe(200)
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const res = await app.request("/api/sessions?page=1&pageSize=10", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as PageBody
    const match = body.data.list.find((s) => s.username === ADMIN_USERNAME && s.ip === "203.0.113.42")
    expect(match).toBeDefined()
    expect(match?.userAgent).toBe("sess-ua-test")
    expect(match?.expiresAt).toBeTruthy()
    expect(match?.createdAt).toBeTruthy()
  })

  it("DELETE /api/sessions/:id 吊销单个会话：refresh 401、重复删除 404", async () => {
    const app = createApp()
    const loginRes = await loginRequest(app, ADMIN_USERNAME, ADMIN_PASSWORD)
    const refreshToken = ((await loginRes.json()) as TokenBody).data.refreshToken
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } })
    if (!record) throw new Error("未找到会话记录")

    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const auth = { authorization: `Bearer ${token}` }
    const del = await app.request(`/api/sessions/${record.id}`, { method: "DELETE", headers: auth })
    expect(del.status).toBe(200)
    // 已吊销 → refresh 401（该用户需重新登录）
    expect((await refreshRequest(app, refreshToken)).status).toBe(401)
    // 会话不再出现在列表中
    const list = await app.request("/api/sessions?page=1&pageSize=50", { headers: auth })
    const listBody = (await list.json()) as PageBody
    expect(listBody.data.list.map((s) => s.id)).not.toContain(record.id)
    // 重复删除（已吊销）→ 404
    const again = await app.request(`/api/sessions/${record.id}`, { method: "DELETE", headers: auth })
    expect(again.status).toBe(404)
  })

  it("POST /api/sessions/:userId/revoke-all 吊销该用户全部在线会话并返回数量", async () => {
    const app = createApp()
    await prisma.user.create({
      data: { username: "stest_victim", passwordHash: await hashPassword("Passw0rd!"), nickname: "会话受害者" },
    })
    const l1 = await loginRequest(app, "stest_victim", "Passw0rd!")
    const l2 = await loginRequest(app, "stest_victim", "Passw0rd!")
    const token1 = ((await l1.json()) as TokenBody).data.refreshToken
    const token2 = ((await l2.json()) as TokenBody).data.refreshToken
    const victim = await prisma.user.findUnique({ where: { username: "stest_victim" } })
    if (!victim) throw new Error("未找到受害用户")

    const adminToken = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const auth = { authorization: `Bearer ${adminToken}` }
    const revokeAll = await app.request(`/api/sessions/${victim.id}/revoke-all`, {
      method: "POST",
      headers: auth,
    })
    expect(revokeAll.status).toBe(200)
    expect(((await revokeAll.json()) as { data: { count: number } }).data.count).toBe(2)
    expect((await refreshRequest(app, token1)).status).toBe(401)
    expect((await refreshRequest(app, token2)).status).toBe(401)
    // 用户不存在 → 404
    const missing = await app.request("/api/sessions/no_such_user/revoke-all", {
      method: "POST",
      headers: auth,
    })
    expect(missing.status).toBe(404)
  })

  it("无 system:session:revoke 权限：GET 放行、DELETE/revoke-all 403", async () => {
    const app = createApp()
    // 只读角色：仅授予会话查询菜单（无强制下线按钮权限）
    const viewerRole = await prisma.role.create({ data: { nameZh: "会话只读", code: "SESS_VIEWER" } })
    await prisma.roleMenu.create({ data: { roleId: viewerRole.id, menuId: sessionQueryMenuId } })
    const viewer = await prisma.user.create({
      data: { username: "stest_viewer", passwordHash: await hashPassword("Passw0rd!"), nickname: "只读用户" },
    })
    await prisma.userRole.create({ data: { userId: viewer.id, roleId: viewerRole.id } })
    const viewerLogin = await loginRequest(app, "stest_viewer", "Passw0rd!")
    const viewerToken = ((await viewerLogin.json()) as TokenBody).data.accessToken
    const viewerAuth = { authorization: `Bearer ${viewerToken}` }

    // 查询放行
    const list = await app.request("/api/sessions?page=1&pageSize=10", { headers: viewerAuth })
    expect(list.status).toBe(200)

    // 吊销被拒
    const ownSession = await prisma.refreshToken.findFirst({ where: { userId: viewer.id, revokedAt: null } })
    if (!ownSession) throw new Error("未找到只读用户的会话")
    const del = await app.request(`/api/sessions/${ownSession.id}`, { method: "DELETE", headers: viewerAuth })
    expect(del.status).toBe(403)
    const revokeAll = await app.request(`/api/sessions/${viewer.id}/revoke-all`, {
      method: "POST",
      headers: viewerAuth,
    })
    expect(revokeAll.status).toBe(403)
  })
})
