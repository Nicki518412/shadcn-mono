import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"
import { LayoutPage } from "./layout"

/** 角色管理页 Page Object */
export class RolesPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await new LayoutPage(this.page).gotoMenu("系统管理", "角色管理", "/system/role")
  }

  /** 新增角色（nameZh/nameEn/code/description 必填组合） */
  async createRole(input: {
    nameZh: string
    nameEn: string
    code: string
    description?: string
  }): Promise<void> {
    await this.page.getByRole("button", { name: "新增角色" }).click()
    const dialog = this.page.getByRole("dialog")
    await dialog.getByLabel("角色中文名称").fill(input.nameZh)
    await dialog.getByLabel("角色英文名称").fill(input.nameEn)
    await dialog.getByLabel("角色编码").fill(input.code)
    if (input.description) await dialog.getByLabel("描述").fill(input.description)
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
  }

  /** 按编码搜索并断言角色可见性 */
  async searchAndExpect(code: string, visible: boolean): Promise<void> {
    await this.page.getByPlaceholder(/搜索角色名称/).fill(code)
    await this.page.getByRole("button", { name: "搜索" }).click()
    const row = this.page.getByRole("row").filter({ hasText: code })
    if (visible) {
      await expect(row).toBeVisible()
    } else {
      await expect(row).toHaveCount(0)
    }
  }

  /** 删除角色（AlertDialog 确认；role 为 alertdialog 非 dialog） */
  async deleteRole(nameZh: string): Promise<void> {
    const row = this.page.getByRole("row").filter({ hasText: nameZh })
    await row.getByRole("button", { name: "删除" }).click()
    const dialog = this.page.getByRole("alertdialog")
    await dialog.getByRole("button", { name: "删除", exact: true }).click()
    await expect(dialog).toBeHidden()
  }
}
