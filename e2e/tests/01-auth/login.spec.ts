import { test, expect } from "@playwright/test"
import { E2E_API_URL } from "../../playwright.config"
import { LoginPage } from "../../pages/login"

/**
 * 认证类目：登录
 * - 成功登录跳转 Dashboard
 * - 密码错误 / 用户不存在 同文案且停留登录页
 * - 账号禁用禁止登录
 * - 连续失败触发账号锁定（15 分钟）
 */
test.describe("登录", () => {
  test("未登录访问业务深链：登录后恢复原地址", async ({ page }) => {
    await page.goto("/system/user?source=e2e#users")
    await expect(page).toHaveURL(/\/login$/)

    const login = new LoginPage(page)
    await login.login("admin", "Admin@123")
    await expect(page).toHaveURL(/\/system\/user\?source=e2e#users$/)
    await expect(page.getByRole("heading", { name: /用户管理|Users/i })).toBeVisible()
  })

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

  test("邮箱动态码：发送后进入冷却，错误验证码给出反馈", async ({ page, request }) => {
    const email = `e2e_otp_${Date.now()}@example.com`
    const adminLogin = await request.post(`${E2E_API_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    const createRes = await request.post(`${E2E_API_URL}/api/users`, {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { username: `e2e_otp_${Date.now()}`, password: "Passw0rd!", nickname: "动态码测试", email },
    })
    expect(createRes.status()).toBe(200)

    await page.goto("/login")
    await page.getByRole("tab", { name: /邮箱验证码|Email/i }).click()
    await page.getByRole("textbox", { name: /邮箱|Email/i }).fill(email)
    await page.getByRole("button", { name: /发送验证码|Send code/i }).click()
    await expect(page.getByRole("button", { name: /秒后重发|Resend in/i })).toBeDisabled()
    await page.locator("#login-otp-email-code").fill("000000")
    await page.getByRole("button", { name: /登录|Sign in/i, exact: true }).click()
    await expect(page.getByRole("alert")).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test("连续 5 次失败：账号锁定 15 分钟", async ({ page, request }) => {
    // 用专用账号测试锁定（throttle 为 server 进程内存级，锁定 admin 会污染同次运行其他用例的登录）
    const lockUsername = "e2e_lockme"
    const adminLogin = await request.post(`${E2E_API_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    await request.post(`${E2E_API_URL}/api/users`, {
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
