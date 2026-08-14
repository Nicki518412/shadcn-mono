import { expect } from "@playwright/test"
import { API_BASE_URL, test } from "../../fixtures"
import { LayoutPage } from "../../pages/layout"

/**
 * 参数配置类目：CRUD。
 */
test.describe("参数配置", () => {
  async function gotoConfigs(adminPage: import("@playwright/test").Page): Promise<void> {
    await new LayoutPage(adminPage).gotoMenu("系统管理", "参数配置", "/system/config")
  }

  test("新增参数：填表提交后列表可见（键转小写）", async ({ adminPage }) => {
    await gotoConfigs(adminPage)
    const key = `e2e_config_${Date.now()}`
    await adminPage.getByRole("button", { name: "新增参数" }).click()
    const dialog = adminPage.getByRole("dialog")
    await dialog.getByLabel("参数键").fill(key.toUpperCase())
    await dialog.getByLabel("参数值").fill("e2e-value")
    await dialog.getByLabel("参数中文名称").fill("E2E 参数")
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
    await expect(adminPage.getByRole("cell").filter({ hasText: key }).first()).toBeVisible()
  })

  test("编辑参数：修改值后列表更新", async ({ adminPage }) => {
    await gotoConfigs(adminPage)
    const key = `e2e_config_edit_${Date.now()}`
    const adminLogin = await adminPage.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    const createRes = await adminPage.request.post(`${API_BASE_URL}/api/configs`, {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { configKey: key, configValue: "old", nameZh: "E2E 编辑参数" },
    })
    if (createRes.status() !== 200) throw new Error(`API 创建参数失败: ${String(createRes.status())}`)
    await adminPage.reload()
    // 搜索定位（避免首屏分页/顺序影响）
    await adminPage.getByPlaceholder(/搜索参数键/).fill(key)
    await adminPage.getByRole("button", { name: "搜索" }).click()
    const row = adminPage.getByRole("row").filter({ hasText: key })
    await row.getByRole("button", { name: "编辑" }).click()
    const dialog = adminPage.getByRole("dialog")
    await dialog.getByLabel("参数值").fill("new-value")
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
    await expect(row).toContainText("new-value")
  })

  test("删除参数：确认后列表消失", async ({ adminPage }) => {
    await gotoConfigs(adminPage)
    const key = `e2e_config_del_${Date.now()}`
    const adminLogin = await adminPage.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    const createRes = await adminPage.request.post(`${API_BASE_URL}/api/configs`, {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { configKey: key, configValue: "v", nameZh: "E2E 删除参数" },
    })
    if (createRes.status() !== 200) throw new Error(`API 创建参数失败: ${String(createRes.status())}`)
    await adminPage.reload()
    const row = adminPage.getByRole("row").filter({ hasText: key })
    await row.getByRole("button", { name: "删除" }).click()
    const alert = adminPage.getByRole("alertdialog")
    await alert.getByRole("button", { name: "删除", exact: true }).click()
    await expect(row).toHaveCount(0)
  })
})
