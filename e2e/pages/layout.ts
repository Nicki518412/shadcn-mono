import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"
import { LoginPage } from "./login"

/**
 * 布局 Page Object：侧边栏导航/折叠、顶栏操作（主题/语言/用户菜单）。
 * 选择器基于组件文案（i18n zh 默认；en 用例自行处理）。
 */
export class LayoutPage {
  constructor(readonly page: Page) {}

  /**
   * 打开管理端首页（会话由 storageState 恢复）。
   * refresh token 为单活轮换：首个 context 使用后旧 token 吊销，后续 context 打开即被踢回登录页——
   * 检测到登录页时自动重新登录恢复会话（登录幂等，不影响用例语义）。
   */
  async goto(): Promise<void> {
    await this.page.goto("/")
    // SPA 重定向异步发生：等待布局标志（概览链接）出现；超时说明被踢回登录页
    // （storageState 的 refresh token 单活轮换，被首个 context 使用后旧 token 吊销）→ 重新登录恢复
    try {
      await this.page.getByRole("link", { name: /概览|Dashboard/ }).first().waitFor({
        state: "visible",
        timeout: 10_000,
      })
    } catch {
      await new LoginPage(this.page).login("admin", "Admin@123")
      await expect(this.page.getByRole("link", { name: /概览|Dashboard/ }).first()).toBeVisible()
    }
  }

  /** 通过侧边栏菜单导航（支持多级：目录名 → 菜单名），到达后等待路径。
   * 目录 trigger 为开关（点击切换折叠）——仅当收起（aria-expanded=false）时才点击展开，
   * 避免"默认展开 → 点击收起 → 菜单不可见"的误折叠 */
  async gotoMenu(dir: string, menu: string, path: string): Promise<void> {
    const dirTrigger = this.page.getByRole("button", { name: dir, exact: true })
    const menuItem = this.page.getByRole("link", { name: menu }).first()
    if (!(await menuItem.isVisible().catch(() => false))) {
      const expanded = (await dirTrigger.getAttribute("aria-expanded")) === "true"
      if (!expanded) await dirTrigger.click()
    }
    await menuItem.click()
    await expect(this.page).toHaveURL(new RegExp(path))
  }

  /** 侧边栏根容器（base-nova Sidebar 渲染为 div + data-slot="sidebar" + data-collapsible） */
  sidebar(): import("@playwright/test").Locator {
    return this.page.locator('[data-slot="sidebar"]').first()
  }

  /** 侧边栏折叠切换（顶部 trigger；aria-label 硬编码英文 "Toggle Sidebar"） */
  async toggleSidebar(): Promise<void> {
    await this.page.getByRole("button", { name: "Toggle Sidebar" }).click()
  }

  /** 顶栏主题切换（明暗交替；aria-label 为「切换到亮/暗色主题」） */
  async toggleTheme(): Promise<void> {
    await this.page.getByRole("button", { name: /切换到(亮|暗)色主题/ }).click()
  }

  /** 顶栏语言切换到指定语言（菜单项 nativeName：中文 / English） */
  async switchLanguage(target: "中文" | "English"): Promise<void> {
    await this.page.getByRole("button", { name: /切换语言|Switch language/i }).click()
    await this.page.getByRole("menuitem", { name: target }).click()
  }

  /** 打开左下角用户菜单（sidebar-footer 内 dropdown trigger；不依赖昵称文案——用例可能改过昵称） */
  async openUserMenu(): Promise<void> {
    await this.page.locator('[data-slot="sidebar-footer"] [data-slot="dropdown-menu-trigger"]').click()
  }
}

/** 登录后布局断言：侧边栏品牌 + 概览菜单可见 */
export async function expectAppLoaded(page: Page): Promise<void> {
  await expect(page.getByRole("link", { name: /概览|Dashboard/ }).first()).toBeVisible()
}
