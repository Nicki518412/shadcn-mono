import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"

/** 登录页 Page Object（登录/登出/锁定等用例与 setup 共用） */
export class LoginPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/login")
  }

  /** 填表提交登录；返回是否停留登录页（失败时） */
  async login(username: string, password: string): Promise<void> {
    await this.page.getByLabel(/用户名|Username/).fill(username)
    await this.page.getByLabel(/密码|Password/).fill(password)
    await this.page.getByRole("button", { name: /登录|Sign in/ }).click()
  }

  /** 登录成功：跳转 Dashboard（URL 离开 /login） */
  async expectLoggedIn(): Promise<void> {
    await expect(this.page).not.toHaveURL(/\/login/)
  }

  /** 登录失败：停留登录页并显示错误 */
  async expectError(): Promise<void> {
    await expect(this.page).toHaveURL(/\/login/)
    await expect(this.page.getByRole("alert")).toBeVisible()
  }
}
