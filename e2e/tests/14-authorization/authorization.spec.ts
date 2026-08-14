import { expect, test } from "@playwright/test"
import { E2E_API_URL } from "../../playwright.config"

test.describe("低权限授权边界", () => {
  test("访客看不到管理菜单，深链不可达，直接写 API 返回 403", async ({ page, request }) => {
    const username = `e2e_guest_${Date.now()}`
    const password = "Passw0rd!"
    const adminLogin = await request.post(`${E2E_API_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    const adminHeaders = { authorization: `Bearer ${adminBody.data.accessToken}` }
    const guestRoleRes = await request.get(`${E2E_API_URL}/api/roles?keyword=GUEST`, {
      headers: adminHeaders,
    })
    const guestRoleBody = (await guestRoleRes.json()) as { data: { list: { id: string; code: string }[] } }
    const guestRole = guestRoleBody.data.list.find((role) => role.code === "GUEST")
    if (!guestRole) throw new Error("种子数据缺少 GUEST 角色")

    const createUserRes = await request.post(`${E2E_API_URL}/api/users`, {
      headers: adminHeaders,
      data: { username, password, nickname: "访客权限测试", roleIds: [guestRole.id] },
    })
    expect(createUserRes.status()).toBe(200)
    const guestLogin = await request.post(`${E2E_API_URL}/api/auth/login`, {
      data: { username, password },
    })
    const guestBody = (await guestLogin.json()) as {
      data: { accessToken: string; refreshToken: string }
    }

    await page.goto("/login")
    await page.evaluate((refreshToken) => {
      localStorage.setItem("refreshToken", refreshToken)
      localStorage.setItem("language", "zh")
    }, guestBody.data.refreshToken)
    await page.goto("/")
    await expect(page.getByRole("link", { name: /概览|Dashboard/ })).toBeVisible()
    await expect(page.getByRole("link", { name: /用户管理|Users/i })).toHaveCount(0)

    await page.goto("/system/user")
    await expect(page.getByText("404", { exact: true })).toBeVisible()
    await expect(page.getByRole("heading", { name: /用户管理|Users/i })).toHaveCount(0)

    const forbidden = await request.post(`${E2E_API_URL}/api/users`, {
      headers: { authorization: `Bearer ${guestBody.data.accessToken}` },
      data: { username: `forbidden_${Date.now()}`, password, nickname: "不应创建" },
    })
    expect(forbidden.status()).toBe(403)
    expect(((await forbidden.json()) as { code: string }).code).toBe("PERMISSION_DENIED")
  })
})
