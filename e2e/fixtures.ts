import { test as base, expect } from "@playwright/test"

/**
 * 管理端会话 fixture：每个用例独立 API 登录并注入 refresh token。
 * 不用 storageState 复用单 token——refresh token 为单活轮换（首个使用即吊销旧 token），
 * 多 context 复用同一 token 会因轮换竞态把后续 context 踢回登录页。
 * 登录为幂等操作（每次新建独立会话），用例之间互不干扰。
 */
export const test = base.extend({
  adminPage: async ({ page, request }, use) => {
    const loginRes = await request.post("http://localhost:3001/api/auth/login", {
      data: { username: "admin", password: "Admin@123" },
    })
    if (loginRes.status() !== 200) {
      throw new Error(`fixture 登录失败: ${String(loginRes.status())}`)
    }
    const body = (await loginRes.json()) as { data: { refreshToken: string } }
    // 在登录页注入 token + 中文语言，再打开首页触发会话恢复（内存 access token 为空 → refresh）
    await page.goto("/login")
    await page.evaluate(
      ([refreshToken, language]) => {
        localStorage.setItem("refreshToken", refreshToken)
        localStorage.setItem("language", language)
      },
      [body.data.refreshToken, "zh"] as const,
    )
    await page.goto("/")
    await expect(page.getByRole("link", { name: /概览|Dashboard/ }).first()).toBeVisible()
    await use(page)
  },
})
