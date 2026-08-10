import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@repo/db"
import { hashPassword } from "@repo/db"
import { createApp } from "../src/index.js"

const ADMIN_USERNAME = "log_admin"
const ADMIN_PASSWORD = "Passw0rd!"
const PLAIN_USERNAME = "log_plain"

/** 按权限码查菜单，不存在则创建（permission 唯一索引：其他测试文件可能已建同码菜单，复用而非重建） */
async function upsertMenu(data: {
  nameZh: string
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

async function login(username: string, password: string): Promise<string> {
  const app = createApp()
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  if (res.status !== 200) throw new Error(`登录失败: ${String(res.status)}`)
  const body = (await res.json()) as { data: { accessToken: string } }
  return body.data.accessToken
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

  it("POST /api/users 写操作产生 OperationLog（操作账号 / 方法 / 路径 / 状态码 / 耗时）", async () => {
    const app = createApp()
    const token = await login(ADMIN_USERNAME, ADMIN_PASSWORD)
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
  })

  it("GET /api/logs/login：无 system:log:query 权限 403，有则 200 返回分页列表", async () => {
    const app = createApp()
    const plainToken = await login(PLAIN_USERNAME, ADMIN_PASSWORD)
    const forbidden = await app.request("/api/logs/login?page=1&pageSize=10", {
      headers: { authorization: `Bearer ${plainToken}` },
    })
    expect(forbidden.status).toBe(403)
    expect(((await forbidden.json()) as { code: string }).code).toBe("PERMISSION_DENIED")

    const adminToken = await login(ADMIN_USERNAME, ADMIN_PASSWORD)
    const ok = await app.request("/api/logs/login?page=1&pageSize=10", {
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as {
      data: { list: { id: string; username: string; status: string }[]; total: number }
    }
    expect(Array.isArray(body.data.list)).toBe(true)
    expect(typeof body.data.total).toBe("number")
    // 列表按时间倒序，最近的记录（admin 成功登录）应在前
    expect(body.data.list[0]?.username).toBe(ADMIN_USERNAME)
    expect(body.data.list[0]?.status).toBe("SUCCESS")
  })
})
