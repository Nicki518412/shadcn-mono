import { expect } from "@playwright/test"
import { test } from "../../fixtures"
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

  test("强制下线：fixture 会话被踢后 refresh 失效", async ({ adminPage }) => {
    // 当前页面 context 的会话（fixture 登录）是列表中的 admin 会话——从 localStorage 取 refresh token
    const refreshToken = await adminPage.evaluate(() => localStorage.getItem("refreshToken"))
    if (!refreshToken) throw new Error("页面无 refresh token")

    await gotoSessions(adminPage)
    const row = adminPage.getByRole("row").filter({ hasText: "admin" }).first()
    await row.getByRole("button", { name: "强制下线" }).click()
    const alert = adminPage.getByRole("alertdialog")
    await alert.getByRole("button", { name: "强制下线", exact: true }).click()
    await expect(alert).toBeHidden()

    // 被踢会话的 refresh token 已吊销：refresh 轮换必须 401（JWT access token 5 分钟内仍有效，不做该断言）
    const refreshRes = await adminPage.request.post("http://localhost:3001/api/auth/refresh", {
      data: { refreshToken },
    })
    expect(refreshRes.status()).toBe(401)
  })
})
