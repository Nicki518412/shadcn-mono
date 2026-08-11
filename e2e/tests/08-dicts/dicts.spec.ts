import { expect } from "@playwright/test"
import { test } from "../../fixtures"
import { LayoutPage } from "../../pages/layout"

/**
 * 数据字典类目：字典类型 CRUD + 字典项维护。
 */
test.describe("数据字典", () => {
  async function gotoDicts(adminPage: import("@playwright/test").Page): Promise<void> {
    await new LayoutPage(adminPage).gotoMenu("系统管理", "数据字典", "/system/dict")
  }

  test("新增字典类型：填表提交后列表可见", async ({ adminPage }) => {
    await gotoDicts(adminPage)
    const code = `e2e_dict_${Date.now()}`
    await adminPage.getByRole("button", { name: "新增类型" }).click()
    const dialog = adminPage.getByRole("dialog")
    await dialog.getByLabel("类型编码").fill(code)
    await dialog.getByLabel("类型中文名称").fill("E2E 字典类型")
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
    await expect(adminPage.getByRole("cell").filter({ hasText: code }).first()).toBeVisible()
  })

  test("字典项维护：新增字典项后展开类型可见", async ({ adminPage }) => {
    await gotoDicts(adminPage)
    // API 前置创建字典类型
    const adminLogin = await adminPage.request.post("http://localhost:3001/api/auth/login", {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    const code = `e2e_dict_items_${Date.now()}`
    const createRes = await adminPage.request.post("http://localhost:3001/api/dicts/types", {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { typeCode: code, nameZh: "E2E 字典项类型" },
    })
    if (createRes.status() !== 200) throw new Error(`API 创建字典类型失败: ${String(createRes.status())}`)
    await adminPage.reload()
    const row = adminPage.getByRole("row").filter({ hasText: code })
    await expect(row).toBeVisible()
    await row.getByRole("button", { name: /编辑/ }).click()
    // 字典项为行内编辑：新增一行后直接填列（labelZh/labelEn/value/sort/status）
    const dialog = adminPage.getByRole("dialog")
    await dialog.getByRole("button", { name: /新增字典项/ }).click()
    const newRow = dialog.locator("tbody tr").last()
    await newRow.locator("input").nth(0).fill("E2E 项")
    await newRow.locator("input").nth(2).fill("e2e_value")
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
    // 列表可见项
    await adminPage.reload()
    await expect(adminPage.getByRole("cell").filter({ hasText: "E2E 项" }).first()).toBeVisible()
  })
})
