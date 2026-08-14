import { expect } from "@playwright/test"
import { API_BASE_URL, test } from "../../fixtures"
import { LayoutPage } from "../../pages/layout"

/**
 * 日志管理类目：登录日志 / 操作日志列表与详情。
 */
test.describe("日志管理", () => {
  async function gotoLogs(adminPage: import("@playwright/test").Page): Promise<void> {
    await new LayoutPage(adminPage).gotoMenu("系统管理", "日志管理", "/system/log")
  }

  test("登录日志：admin 登录成功记录可见", async ({ adminPage }) => {
    await gotoLogs(adminPage)
    // 登录日志 tab 默认选中；搜索 admin 出现成功记录
    await adminPage.getByPlaceholder(/搜索/).fill("admin")
    await adminPage.getByRole("button", { name: "搜索" }).click()
    await expect(adminPage.getByRole("cell").filter({ hasText: "admin" }).first()).toBeVisible()
    await expect(adminPage.getByRole("cell").filter({ hasText: "成功" }).first()).toBeVisible()
  })

  test("操作日志：写操作被记录（fixture 登录即产生记录）", async ({ adminPage }) => {
    await gotoLogs(adminPage)
    await adminPage.getByRole("tab", { name: "操作日志" }).click()
    // 操作日志列表有行（fixture 登录 + 页面加载产生的操作记录；登录接口 POST 会记）
    await expect(adminPage.getByRole("row").nth(1)).toBeVisible()
  })

  test("操作日志详情：弹窗展示请求信息", async ({ adminPage }) => {
    // 前置：制造一条写操作（POST /api/configs 会被操作日志中间件记录，登录接口被跳过）
    const adminLogin = await adminPage.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    const writeRes = await adminPage.request.post(`${API_BASE_URL}/api/configs`, {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { configKey: `e2e_log_src_${Date.now()}`, configValue: "v", nameZh: "日志详情来源" },
    })
    if (writeRes.status() !== 200) throw new Error(`API 写操作失败: ${String(writeRes.status())}`)

    await gotoLogs(adminPage)
    await adminPage.getByRole("tab", { name: "操作日志" }).click()
    // 其他业务也可能同时写日志，按本用例的请求路径定位，避免依赖全库最新记录。
    const configRow = adminPage.getByRole("row").filter({ hasText: "/api/configs" }).first()
    await expect(configRow).toBeVisible()
    await configRow.getByRole("button", { name: /详情|Details/i }).click()
    await expect(adminPage.getByRole("dialog")).toContainText(/操作日志详情|Details/i)
  })
})
