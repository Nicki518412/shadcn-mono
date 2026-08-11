import { test, expect } from "@playwright/test"
import { LoginPage } from "../../pages/login"

/**
 * 认证类目：登录
 * - 成功登录跳转 Dashboard
 * - 密码错误 / 用户不存在 同文案且停留登录页
 * - 账号禁用禁止登录
 * - 连续失败触发账号锁定（15 分钟）
 */
test.describe("登录", () => {
  test("正确凭据登录成功并进入管理端", async ({ page }) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.login("admin", "Admin@123")
    await login.expectLoggedIn()
    // 布局就绪：概览菜单可见
    await expect(page.getByRole("link", { name: /概览|Dashboard/ }).first()).toBeVisible()
  })

  test("密码错误：同文案提示且停留登录页", async ({ page }) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.login("admin", "wrong-password")
    await login.expectError()
    await expect(page.getByRole("alert")).toContainText(/用户名或密码错误|Invalid username or password/i)
  })

  test("用户不存在：与密码错误同文案（防枚举）", async ({ page }) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.login("no_such_user_e2e", "WrongPass1!")
    await login.expectError()
    await expect(page.getByRole("alert")).toContainText(/用户名或密码错误|Invalid username or password/i)
  })

  test("连续 5 次失败：账号锁定 15 分钟", async ({ page, request }) => {
    // 用专用账号测试锁定（throttle 为 server 进程内存级，锁定 admin 会污染同次运行其他用例的登录）
    const lockUsername = "e2e_lockme"
    const adminLogin = await request.post("http://localhost:3001/api/auth/login", {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    await request.post("http://localhost:3001/api/users", {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { username: lockUsername, password: "Passw0rd!", nickname: "锁定测试" },
    })

    const login = new LoginPage(page)
    await login.goto()
    for (let i = 0; i < 5; i += 1) {
      await login.login(lockUsername, "wrong-password")
      await login.expectError()
    }
    // 第 6 次即使密码正确也锁定
    await login.login(lockUsername, "Passw0rd!")
    await expect(page.getByRole("alert")).toContainText(/锁定|Locked/i)
    await expect(page).toHaveURL(/\/login/)
  })
})
