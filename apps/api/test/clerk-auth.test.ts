import { beforeAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@repo/db"
import { loadConfig } from "../src/config.js"
import { createApp } from "../src/index.js"
import { clerkAuthenticate, cleanUsernameBase, uniqueUsername } from "../src/middleware/clerk-auth.js"

// @clerk/backend 全量 mock：外部服务（Clerk 前端 API）不参与测试，认证结果由用例注入
const clerkClientMock = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  users: { getUser: vi.fn() },
}))

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => clerkClientMock,
}))

const CLERK_USER_ID = "clerk_test_1"

/** Clerk 用户档案 mock（clerkAuth 中间件仅使用以下字段） */
function clerkUser(opts: {
  id?: string
  email?: string
  firstName?: string | null
  lastName?: string | null
} = {}): unknown {
  return {
    id: opts.id ?? CLERK_USER_ID,
    emailAddresses: [{ emailAddress: opts.email ?? "john@example.com" }],
    firstName: opts.firstName ?? "John",
    lastName: opts.lastName ?? "Doe",
    username: "john",
  }
}

/** clerk 模式的 app（认证结果由各用例的 mock 注入） */
function clerkApp() {
  return createApp(loadConfig({ ...process.env, AUTH_PROVIDER: "clerk" }))
}

describe("clerk-auth 中间件", () => {
  beforeAll(() => {
    process.env.CLERK_SECRET_KEY = "test-secret"
  })

  it("首次登录自动建号：username 从 email 前缀唯一化、passwordHash 空串、nickname 拼接、email 统一小写", async () => {
    clerkClientMock.authenticateRequest.mockResolvedValueOnce({
      isAuthenticated: true,
      toAuth: () => ({ userId: CLERK_USER_ID }),
    })
    clerkClientMock.users.getUser.mockResolvedValueOnce(clerkUser({ email: "John.Doe@Example.com" }))

    const app = clerkApp()
    const res = await app.request("/api/auth/me", { headers: { authorization: "Bearer clerk-token" } })
    expect(res.status).toBe(200)

    const user = await prisma.user.findUnique({ where: { clerkId: CLERK_USER_ID } })
    expect(user).not.toBeNull()
    expect(user?.username).toBe("john.doe")
    expect(user?.passwordHash).toBe("")
    expect(user?.nickname).toBe("John Doe")
    expect(user?.email).toBe("john.doe@example.com")
  })

  it("clerkId 已映射：直接放行，不重复建号（getUser 不被调用）", async () => {
    await prisma.user.create({
      data: { username: "clerk_existing", passwordHash: "", nickname: "已有用户", clerkId: "clerk_test_2" },
    })
    clerkClientMock.authenticateRequest.mockResolvedValueOnce({
      isAuthenticated: true,
      toAuth: () => ({ userId: "clerk_test_2" }),
    })
    clerkClientMock.users.getUser.mockClear()

    const app = clerkApp()
    const res = await app.request("/api/auth/me", { headers: { authorization: "Bearer clerk-token" } })
    expect(res.status).toBe(200)
    const count = await prisma.user.count({ where: { clerkId: "clerk_test_2" } })
    expect(count).toBe(1)
    expect(clerkClientMock.users.getUser).not.toHaveBeenCalled()
  })

  it("username 冲突：追加数字后缀唯一化", async () => {
    await prisma.user.create({
      data: { username: "clerk_conflict", passwordHash: "", nickname: "占用者" },
    })
    clerkClientMock.authenticateRequest.mockResolvedValueOnce({
      isAuthenticated: true,
      toAuth: () => ({ userId: "clerk_test_3" }),
    })
    clerkClientMock.users.getUser.mockResolvedValueOnce(clerkUser({ id: "clerk_test_3", email: "clerk_conflict@example.com" }))

    const app = clerkApp()
    const res = await app.request("/api/auth/me", { headers: { authorization: "Bearer clerk-token" } })
    expect(res.status).toBe(200)
    const user = await prisma.user.findUnique({ where: { clerkId: "clerk_test_3" } })
    expect(user?.username).toBe("clerk_conflict1")
  })

  it("email 撞库（本地账号已用该邮箱）：409 引导文案，不建号", async () => {
    await prisma.user.create({
      data: { username: "local_taken", passwordHash: "", nickname: "本地占用", email: "taken@example.com" },
    })
    clerkClientMock.authenticateRequest.mockResolvedValueOnce({
      isAuthenticated: true,
      toAuth: () => ({ userId: "clerk_test_5" }),
    })
    clerkClientMock.users.getUser.mockResolvedValueOnce(clerkUser({ id: "clerk_test_5", email: "taken@example.com" }))

    const app = clerkApp()
    const res = await app.request("/api/auth/me", { headers: { authorization: "Bearer clerk-token" } })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { code: string; message: string }
    expect(body.code).toBe("EMAIL_TAKEN")
    expect(body.message).toBe("该邮箱已被本地账号使用，请联系管理员")
    const count = await prisma.user.count({ where: { clerkId: "clerk_test_5" } })
    expect(count).toBe(0)
  })

  it("并发首次登录竞态：create 撞唯一索引后按 clerkId 复用胜者账号", async () => {
    clerkClientMock.authenticateRequest.mockResolvedValueOnce({
      isAuthenticated: true,
      toAuth: () => ({ userId: "clerk_test_6" }),
    })
    // 模拟并发对手已抢先建号：在 getUser（Clerk API）之后、本地 create 之前写入胜者 →
    // 中间件 create 撞真实 clerkId 唯一索引（P2002）→ 按 clerkId 重查复用，不重复建号
    clerkClientMock.users.getUser.mockImplementationOnce(async () => {
      await prisma.user.create({
        data: {
          username: "race_winner",
          passwordHash: "",
          nickname: "竞态胜者",
          email: "race@example.com",
          clerkId: "clerk_test_6",
        },
      })
      return clerkUser({ id: "clerk_test_6", email: "race@example.com" })
    })

    const app = clerkApp()
    const res = await app.request("/api/auth/me", { headers: { authorization: "Bearer clerk-token" } })
    expect(res.status).toBe(200)
    const users = await prisma.user.findMany({ where: { clerkId: "clerk_test_6" } })
    expect(users).toHaveLength(1)
    expect(users[0]?.username).toBe("race_winner")
  })

  it("本地账号禁用：401 账号不可用", async () => {
    await prisma.user.create({
      data: {
        username: "clerk_disabled",
        passwordHash: "",
        nickname: "禁用用户",
        clerkId: "clerk_test_4",
        status: false,
      },
    })
    clerkClientMock.authenticateRequest.mockResolvedValueOnce({
      isAuthenticated: true,
      toAuth: () => ({ userId: "clerk_test_4" }),
    })

    const app = clerkApp()
    const res = await app.request("/api/auth/me", { headers: { authorization: "Bearer clerk-token" } })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { code: string; message: string }
    expect(body.code).toBe("UNAUTHORIZED")
    expect(body.message).toBe("账号不可用")
  })

  it("Clerk 验证抛错（网络/API 异常）：401 Clerk 会话无效", async () => {
    clerkClientMock.authenticateRequest.mockRejectedValueOnce(new Error("clerk api down"))

    const app = clerkApp()
    const res = await app.request("/api/auth/me", { headers: { authorization: "Bearer clerk-token" } })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { code: string; message: string }
    expect(body.code).toBe("UNAUTHORIZED")
    expect(body.message).toBe("Clerk 会话无效")
  })

  it("Clerk 未认证 state（token 无效）：401 Clerk 会话无效", async () => {
    clerkClientMock.authenticateRequest.mockResolvedValueOnce({ isAuthenticated: false })

    const app = clerkApp()
    const res = await app.request("/api/auth/me", { headers: { authorization: "Bearer clerk-token" } })
    expect(res.status).toBe(401)
    expect((await res.json()) as { code: string }).toMatchObject({ code: "UNAUTHORIZED" })
  })

  it("无 Authorization 头：401 未登录（不调用 Clerk API）", async () => {
    clerkClientMock.authenticateRequest.mockClear()

    const app = clerkApp()
    const res = await app.request("/api/auth/me")
    expect(res.status).toBe(401)
    expect(clerkClientMock.authenticateRequest).not.toHaveBeenCalled()
  })

  it("provider 分支：local 模式走 JWT 中间件（不调用 Clerk API）", async () => {
    clerkClientMock.authenticateRequest.mockClear()
    const app = createApp(loadConfig({ ...process.env, AUTH_PROVIDER: "local" }))
    const res = await app.request("/api/auth/me", { headers: { authorization: "Bearer not-a-jwt" } })
    expect(res.status).toBe(401)
    expect(clerkClientMock.authenticateRequest).not.toHaveBeenCalled()
  })

  it("CLERK_SECRET_KEY 缺失：clerkAuthenticate 构造时抛错", () => {
    const prev = process.env.CLERK_SECRET_KEY
    delete process.env.CLERK_SECRET_KEY
    try {
      expect(() => clerkAuthenticate()).toThrow(/CLERK_SECRET_KEY/)
    } finally {
      process.env.CLERK_SECRET_KEY = prev
    }
  })
})

describe("uniqueUsername", () => {
  it("清洗 email 前缀：小写 + 非法字符去除 + 截断 32；空 → user", async () => {
    const neverTaken = (): Promise<boolean> => Promise.resolve(false)
    await expect(uniqueUsername("John.Doe", neverTaken)).resolves.toBe("john.doe")
    await expect(uniqueUsername("Foo!Bar@Baz", neverTaken)).resolves.toBe("foobarbaz")
    await expect(uniqueUsername("", neverTaken)).resolves.toBe("user")
    await expect(uniqueUsername("a".repeat(40), neverTaken)).resolves.toBe("a".repeat(32))
  })

  it("冲突时追加递增数字后缀", async () => {
    const taken = new Set(["user", "user1"])
    const isTaken = (name: string): Promise<boolean> => Promise.resolve(taken.has(name))
    await expect(uniqueUsername("user", isTaken)).resolves.toBe("user2")
  })

  it("cleanUsernameBase 边界", () => {
    expect(cleanUsernameBase("Jöhn Döe")).toBe("jhnde")
    expect(cleanUsernameBase("!@#$%^&*")).toBe("")
    expect(cleanUsernameBase("AbcDEF")).toBe("abcdef")
  })
})
