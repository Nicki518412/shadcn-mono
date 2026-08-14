import { expect } from "@playwright/test"
import { API_BASE_URL, test } from "../../fixtures"
import { LayoutPage } from "../../pages/layout"

/**
 * 菜单管理类目：树表 CRUD + 类型约束（MENU 必填路由/组件；BUTTON 无图标选择器）。
 * 菜单中文名使用 e2e_m 前缀（无唯一约束，靠名称断言）。
 */
test.describe("菜单管理", () => {
  async function gotoMenus(adminPage: import("@playwright/test").Page): Promise<void> {
    await new LayoutPage(adminPage).gotoMenu("系统管理", "菜单管理", "/system/menu")
  }

  test("新增菜单（MENU 类型）：填表提交后树中出现", async ({ adminPage }) => {
    await gotoMenus(adminPage)
    await adminPage.getByRole("button", { name: "新增菜单" }).click()
    const dialog = adminPage.getByRole("dialog")
    await dialog.getByLabel("菜单中文名称").fill("e2e_m_page")
    await dialog.getByLabel("菜单英文名称").fill("E2E Menu")
    // 类型选择 MENU
    await dialog.getByLabel("类型").click()
    await adminPage.getByRole("option", { name: "MENU" }).click()
    // MENU 必填：路由路径 + 组件
    await dialog.getByLabel("路由路径").fill("/e2e/menu")
    await dialog.getByLabel("组件").fill("system/e2e")
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
    // 树表断言（单元格文本）
    await expect(adminPage.getByRole("cell").filter({ hasText: "e2e_m_page" }).first()).toBeVisible()
  })

  test("类型约束：BUTTON 类型不显示图标选择器且必填父级", async ({ adminPage }) => {
    await gotoMenus(adminPage)
    await adminPage.getByRole("button", { name: "新增菜单" }).click()
    const dialog = adminPage.getByRole("dialog")
    await dialog.getByLabel("类型").click()
    await adminPage.getByRole("option", { name: "BUTTON" }).click()
    // BUTTON 无图标选择器（图标行不渲染）
    await expect(dialog.getByText("选择图标")).toHaveCount(0)
    // 父级必填：直接保存被拦
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog.getByRole("alert")).toBeVisible()
  })

  test("删除菜单：确认后从树中消失", async ({ adminPage }) => {
    await gotoMenus(adminPage)
    const name = "e2e_m_delete"
    // API 前置创建（permission 唯一键避免与种子冲突）
    const adminLogin = await adminPage.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    const createRes = await adminPage.request.post(`${API_BASE_URL}/api/menus`, {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { nameZh: name, type: "MENU", path: "/e2e/delete", component: "system/e2e-delete", sort: 0, status: true },
    })
    if (createRes.status() !== 200) throw new Error(`API 创建菜单失败: ${String(createRes.status())}`)
    await adminPage.reload()
    const cell = adminPage.getByRole("cell").filter({ hasText: name }).first()
    await expect(cell).toBeVisible()
    // 行内删除按钮（树表行结构：操作列）
    await cell.locator("xpath=ancestor::tr").getByRole("button", { name: "删除" }).click()
    const alert = adminPage.getByRole("alertdialog")
    await alert.getByRole("button", { name: "删除", exact: true }).click()
    await expect(cell).toHaveCount(0)
  })
})
