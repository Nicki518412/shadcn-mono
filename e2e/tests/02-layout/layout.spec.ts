import { expect } from "@playwright/test"
import { test } from "../../fixtures"
import { LayoutPage } from "../../pages/layout"

/**
 * 布局类目：侧边栏折叠/导航/面包屑、主题切换、语言切换、用户菜单/退出。
 * 会话由 adminPage fixture 逐用例独立登录（refresh token 单活轮换，不可跨用例复用）。
 */
test.describe("布局", () => {
  test("侧边栏折叠：切换后导航图标模式，内容区保持可见", async ({ adminPage }) => {
    const layout = new LayoutPage(adminPage)
    await expect(adminPage.getByRole("link", { name: /概览|Dashboard/ }).first()).toBeVisible()
    // 折叠后侧边栏 data-collapsible=icon（展开为空）
    await layout.toggleSidebar()
    await expect(layout.sidebar()).toHaveAttribute("data-collapsible", "icon")
    await layout.toggleSidebar()
    await expect(layout.sidebar()).toHaveAttribute("data-collapsible", "")
  })

  test("导航与面包屑：系统管理 → 用户管理，URL 与面包屑一致", async ({ adminPage }) => {
    const layout = new LayoutPage(adminPage)
    await layout.gotoMenu("系统管理", "用户管理", "/system/user")
    // 面包屑：系统管理 / 用户管理
    await expect(adminPage.getByRole("navigation")).toContainText("系统管理")
    await expect(adminPage.getByRole("navigation")).toContainText("用户管理")
  })

  test("主题切换：明暗交替（html.dark 切换）", async ({ adminPage }) => {
    const layout = new LayoutPage(adminPage)
    const html = adminPage.locator("html")
    const isDark = (await html.getAttribute("class"))?.includes("dark") ?? false
    await layout.toggleTheme()
    if (isDark) {
      await expect(html).not.toHaveClass(/dark/)
    } else {
      await expect(html).toHaveClass(/dark/)
    }
  })

  test("语言切换：切英文后侧边栏菜单显示英文名", async ({ adminPage }) => {
    const layout = new LayoutPage(adminPage)
    // try/finally：中途断言失败也切回中文，避免污染依赖中文文案的后续用例
    try {
      await layout.switchLanguage("English")
      // zh → en：概览变 Dashboard（en 环境 nameEn 生效）
      await expect(adminPage.getByRole("link", { name: "Dashboard" }).first()).toBeVisible()
    } finally {
      await layout.switchLanguage("中文")
    }
    await expect(adminPage.getByRole("link", { name: /概览/ }).first()).toBeVisible()
  })

  test("用户菜单：用户设置弹窗可打开关闭", async ({ adminPage }) => {
    const layout = new LayoutPage(adminPage)
    await layout.openUserMenu()
    await adminPage.getByRole("menuitem", { name: /用户设置|User settings/i }).click()
    await expect(adminPage.getByRole("dialog")).toContainText(/用户设置|User settings/i)
    await adminPage.getByRole("dialog").getByRole("button", { name: /取消|Cancel/ }).click()
    await expect(adminPage.getByRole("dialog")).toBeHidden()
  })

  test("退出登录：回到登录页", async ({ adminPage }) => {
    const layout = new LayoutPage(adminPage)
    await layout.openUserMenu()
    await adminPage.getByRole("menuitem", { name: /退出登录|Sign out/i }).click()
    await expect(adminPage).toHaveURL(/\/login/)
  })
})
