import { expect } from "@playwright/test"
import { API_BASE_URL, test } from "../../fixtures"
import { LayoutPage } from "../../pages/layout"

/**
 * 部门管理类目：树形 CRUD（新增根部门 → 子部门 → 删除级联）。
 */
test.describe("部门管理", () => {
  async function gotoDepartments(adminPage: import("@playwright/test").Page): Promise<void> {
    await new LayoutPage(adminPage).gotoMenu("系统管理", "部门管理", "/system/department")
  }

  test("新增根部门：填表提交后树中出现", async ({ adminPage }) => {
    await gotoDepartments(adminPage)
    await adminPage.getByRole("button", { name: "新增部门" }).click()
    const dialog = adminPage.getByRole("dialog")
    await dialog.getByLabel("部门中文名称").fill("e2e_d_root")
    await dialog.getByLabel("部门英文名称").fill("E2E Root Dept")
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
    await expect(adminPage.getByRole("cell").filter({ hasText: "e2e_d_root" }).first()).toBeVisible()
  })

  test("新增子部门：父级选择根部门", async ({ adminPage }) => {
    await gotoDepartments(adminPage)
    // 前置：API 创建根部门
    const adminLogin = await adminPage.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    const rootRes = await adminPage.request.post(`${API_BASE_URL}/api/departments`, {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { nameZh: "e2e_d_parent", sort: 0, status: true },
    })
    if (rootRes.status() !== 200) throw new Error(`API 创建根部门失败: ${String(rootRes.status())}`)
    await adminPage.reload()

    await adminPage.getByRole("button", { name: "新增部门" }).click()
    const dialog = adminPage.getByRole("dialog")
    await dialog.getByLabel("部门中文名称").fill("e2e_d_child")
    await dialog.getByLabel("上级部门").click()
    await adminPage.getByRole("option", { name: /e2e_d_parent/ }).click()
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
    await expect(adminPage.getByRole("cell").filter({ hasText: "e2e_d_child" }).first()).toBeVisible()
  })

  test("删除部门：确认后从树中消失（级联子部门）", async ({ adminPage }) => {
    await gotoDepartments(adminPage)
    const name = "e2e_d_delete"
    const adminLogin = await adminPage.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    const res = await adminPage.request.post(`${API_BASE_URL}/api/departments`, {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { nameZh: name, sort: 0, status: true },
    })
    if (res.status() !== 200) throw new Error(`API 创建部门失败: ${String(res.status())}`)
    await adminPage.reload()
    const cell = adminPage.getByRole("cell").filter({ hasText: name }).first()
    await expect(cell).toBeVisible()
    await cell.locator("xpath=ancestor::tr").getByRole("button", { name: "删除" }).click()
    const alert = adminPage.getByRole("alertdialog")
    await alert.getByRole("button", { name: "删除", exact: true }).click()
    await expect(cell).toHaveCount(0)
  })
})
