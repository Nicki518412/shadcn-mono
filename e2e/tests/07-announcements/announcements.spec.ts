import { expect } from "@playwright/test"
import { test } from "../../fixtures"
import { LayoutPage } from "../../pages/layout"

/**
 * 公告管理类目：CRUD + 发布状态（已发布公告在首页顶部横幅展示）。
 */
test.describe("公告管理", () => {
  async function gotoAnnouncements(adminPage: import("@playwright/test").Page): Promise<void> {
    await new LayoutPage(adminPage).gotoMenu("系统管理", "公告管理", "/system/announcement")
  }

  test("新增并发布公告：列表出现且首页横幅展示", async ({ adminPage }) => {
    await gotoAnnouncements(adminPage)
    const title = `e2e_a_banner_${Date.now()}`
    await adminPage.getByRole("button", { name: "新增公告" }).click()
    const dialog = adminPage.getByRole("dialog")
    await dialog.getByLabel("公告标题").fill(title)
    await dialog.getByLabel("公告内容").fill("E2E 公告正文，验证首页横幅")
    // 发布开关默认开（新增即发布）
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
    await expect(adminPage.getByRole("cell").filter({ hasText: title }).first()).toBeVisible()

    // 回到首页：横幅展示该公告
    await adminPage.getByRole("link", { name: "概览" }).first().click()
    await expect(adminPage.getByText(title).first()).toBeVisible()
  })

  test("删除公告：确认后列表消失", async ({ adminPage }) => {
    await gotoAnnouncements(adminPage)
    const title = `e2e_a_delete_${Date.now()}`
    // API 前置创建
    const adminLogin = await adminPage.request.post("http://localhost:3001/api/auth/login", {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    const createRes = await adminPage.request.post("http://localhost:3001/api/announcements", {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { title, content: "待删除公告", published: true },
    })
    if (createRes.status() !== 200) throw new Error(`API 创建公告失败: ${String(createRes.status())}`)
    await adminPage.reload()
    const cell = adminPage.getByRole("cell").filter({ hasText: title }).first()
    await expect(cell).toBeVisible()
    await cell.locator("xpath=ancestor::tr").getByRole("button", { name: "删除" }).click()
    const alert = adminPage.getByRole("alertdialog")
    await alert.getByRole("button", { name: "删除", exact: true }).click()
    await expect(cell).toHaveCount(0)
  })
})
