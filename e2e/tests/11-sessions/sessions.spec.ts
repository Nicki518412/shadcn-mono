import { expect } from "@playwright/test"
import { API_BASE_URL, test } from "../../fixtures"
import { LayoutPage } from "../../pages/layout"

/**
 * 会话管理类目：在线会话列表 + 强制下线（被踢用户需重新登录）。
 */
test.describe("会话管理", () => {
  async function gotoSessions(adminPage: import("@playwright/test").Page): Promise<void> {
    await new LayoutPage(adminPage).gotoMenu("系统管理", "会话管理", "/system/session")
  }

  test("在线会话列表：admin 会话可见", async ({ adminPage }) => {
    await gotoSessions(adminPage)
    await expect(adminPage.getByRole("cell").filter({ hasText: "admin" }).first()).toBeVisible()
  })

  test("强制下线：目标会话被踢后 refresh 失效", async ({ adminPage }) => {
    // 使用专用账号建立唯一会话，避免全量并发时从多个 admin 会话中误选其他 worker 的记录。
    const username = `e2e_session_${Date.now()}`
    const password = "Passw0rd!"
    const adminLogin = await adminPage.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    const createRes = await adminPage.request.post(`${API_BASE_URL}/api/users`, {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { username, password, nickname: "会话测试" },
    })
    expect(createRes.status()).toBe(200)
    const targetLogin = await adminPage.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username, password },
    })
    expect(targetLogin.status()).toBe(200)
    const targetBody = (await targetLogin.json()) as { data: { refreshToken: string } }

    await gotoSessions(adminPage)
    const row = adminPage.getByRole("row").filter({ hasText: username })
    await row.getByRole("button", { name: /强制下线|Force logout/i }).click()
    const alert = adminPage.getByRole("alertdialog")
    await alert.getByRole("button", { name: /强制下线|Force logout/i, exact: true }).click()
    await expect(alert).toBeHidden()

    // 被踢会话的 refresh token 已吊销：refresh 轮换必须 401（JWT access token 5 分钟内仍有效，不做该断言）
    const refreshRes = await adminPage.request.post(`${API_BASE_URL}/api/auth/refresh`, {
      data: { refreshToken: targetBody.data.refreshToken },
    })
    expect(refreshRes.status()).toBe(401)
  })
})
