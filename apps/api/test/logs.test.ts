import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@repo/db"
import { hashPassword } from "@repo/db"
import { createApp } from "../src/index.js"
import { loginAs, upsertMenu } from "./helpers.js"

const ADMIN_USERNAME = "log_admin"
const ADMIN_PASSWORD = "Passw0rd!"
const PLAIN_USERNAME = "log_plain"

/** 登录日志/操作日志均为 fire-and-forget 写入（不 await 响应返回），轮询等待落库 */
async function waitForCount(getCount: () => Promise<number>, timeoutMs = 2000): Promise<number> {
  const deadline = Date.now() + timeoutMs
  let count = 0
  while (Date.now() < deadline) {
    count = await getCount()
    if (count > 0) return count
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return count
}

describe("audit logs", () => {
  beforeAll(async () => {
    // 管理员 + ADMIN 角色；测试库种子未跑，须自建菜单树才有 system:* 权限码（users.test.ts 同款模式）
    const admin = await prisma.user.create({
      data: { username: ADMIN_USERNAME, passwordHash: await hashPassword(ADMIN_PASSWORD), nickname: "管理员" },
    })
    const role = await prisma.role.create({ data: { nameZh: "管理员", code: "ADMIN" } })
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })
    // 无角色用户：权限码为空，用于 403 断言
    await prisma.user.create({
      data: { username: PLAIN_USERNAME, passwordHash: await hashPassword(ADMIN_PASSWORD), nickname: "普通用户" },
    })

    const dir = await prisma.menu.create({ data: { nameZh: "系统管理", type: "DIR", icon: "Settings", sort: 1 } })
    const mLog = await upsertMenu({
      nameZh: "日志管理",
      type: "MENU",
      permission: "system:log:query",
      path: "/system/log",
      component: "system/log",
      icon: "ScrollText",
      parentId: dir.id,
      sort: 4,
    })
    const mUser = await upsertMenu({
      nameZh: "用户管理",
      type: "MENU",
      permission: "system:user:query",
      path: "/system/user",
      component: "system/user",
      icon: "Users",
      parentId: dir.id,
      sort: 1,
    })
    const bCreate = await upsertMenu({
      nameZh: "用户新增",
      type: "BUTTON",
      permission: "system:user:create",
      parentId: mUser.id,
      sort: 1,
    })
    await prisma.roleMenu.createMany({
      data: [dir, mLog, mUser, bCreate].map((menu) => ({ roleId: role.id, menuId: menu.id })),
    })
  })

  it("登录成功写 LoginLog（SUCCESS + userId + ip）；密码错误写 FAILED（LOGIN_FAILED + 尝试用户名）", async () => {
    const app = createApp()
    const ok = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.1" },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    })
    expect(ok.status).toBe(200)
    await waitForCount(() => prisma.loginLog.count({ where: { username: ADMIN_USERNAME, status: "SUCCESS" } }))
    const success = await prisma.loginLog.findFirst({
      where: { username: ADMIN_USERNAME, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
    })
    expect(success?.userId).not.toBeNull()
    expect(success?.message).toBeNull()
    expect(success?.ip).toBe("203.0.113.1")

    // 不存在的用户名：失败也记录尝试的用户名（防枚举场景）
    const fail = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "log_wrong", password: "wrongpass" }),
    })
    expect(fail.status).toBe(401)
    await waitForCount(() => prisma.loginLog.count({ where: { username: "log_wrong", status: "FAILED" } }))
    const failed = await prisma.loginLog.findFirst({
      where: { username: "log_wrong" },
      orderBy: { createdAt: "desc" },
    })
    expect(failed?.message).toBe("LOGIN_FAILED")
    expect(failed?.userId).toBeNull()
  })

  it("POST /api/users 写操作产生 OperationLog（操作账号 / 方法 / 路径 / 状态码 / 耗时 / 请求体快照脱敏）", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const res = await app.request("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: "log_created", password: "Passw0rd!", nickname: "日志用户" }),
    })
    expect(res.status).toBe(200)
    await waitForCount(() =>
      prisma.operationLog.count({ where: { method: "POST", path: "/api/users", statusCode: 200 } }),
    )
    const op = await prisma.operationLog.findFirst({
      where: { method: "POST", path: "/api/users" },
      orderBy: { createdAt: "desc" },
    })
    expect(op?.username).toBe(ADMIN_USERNAME)
    expect(op?.statusCode).toBe(200)
    expect(typeof op?.durationMs).toBe("number")
    // 请求体快照：记录用户名等常规字段，password 脱敏为 ***（不留明文）
    expect(op?.requestBody).toContain("log_created")
    expect(op?.requestBody).toContain('"password":"***"')
    expect(op?.requestBody).not.toContain("Passw0rd!")
  })

  it("敏感路径：change-password 的请求体快照为 null（跳过快照）；refresh 不产生操作日志", async () => {
    const app = createApp()
    // 独立用户改密，避免影响 ADMIN_PASSWORD
    await prisma.user.create({
      data: { username: "log_changepw", passwordHash: await hashPassword("OldPassw0rd!"), nickname: "改密测试" },
    })
    const token = await loginAs("log_changepw", "OldPassw0rd!")
    const res = await app.request("/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword: "OldPassw0rd!", newPassword: "NewPassw0rd!" }),
    })
    expect(res.status).toBe(200)
    await waitForCount(() => prisma.operationLog.count({ where: { path: "/api/auth/change-password" } }))
    const op = await prisma.operationLog.findFirst({
      where: { path: "/api/auth/change-password" },
      orderBy: { createdAt: "desc" },
    })
    expect(op?.requestBody).toBeNull()
    // refresh 在中间件整条跳过列表（登录态续期不审计）
    expect(await prisma.operationLog.count({ where: { path: "/api/auth/refresh" } })).toBe(0)
  })

  it("GET /api/logs/login：无 system:log:query 权限 403，有则 200 返回分页列表", async () => {
    const app = createApp()
    const plainToken = await loginAs(PLAIN_USERNAME, ADMIN_PASSWORD)
    const forbidden = await app.request("/api/logs/login?page=1&pageSize=10", {
      headers: { authorization: `Bearer ${plainToken}` },
    })
    expect(forbidden.status).toBe(403)
    expect(((await forbidden.json()) as { code: string }).code).toBe("PERMISSION_DENIED")

    const adminToken = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const ok = await app.request("/api/logs/login?page=1&pageSize=10", {
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as {
      data: { list: { id: string; username: string; status: string }[]; total: number }
    }
    expect(Array.isArray(body.data.list)).toBe(true)
    expect(typeof body.data.total).toBe("number")
    // 列表按时间倒序；本用例内 log_plain 登录在 admin 之后，不能断言"第一条是 admin"——
    // 改为包含性断言：admin 的成功登录记录存在（时序无关）
    const adminSuccess = body.data.list.find(
      (item) => item.username === ADMIN_USERNAME && item.status === "SUCCESS",
    )
    expect(adminSuccess).toBeDefined()
  })
})
