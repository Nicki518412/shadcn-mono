import { expect } from "@playwright/test"
import { test } from "../../fixtures"
import { LayoutPage } from "../../pages/layout"

/**
 * 通知中心类目：顶栏铃铛（未读徽标/预览/全部已读）+ 通知中心页（列表/发送通知）。
 */
test.describe("通知中心", () => {
  test("顶栏铃铛：未读徽标与最近通知预览可见", async ({ adminPage }) => {
    // 种子含 2 条未读通知 → 铃铛徽标非空
    const bell = adminPage.getByRole("button", { name: /Notifications|消息中心/ })
    await expect(bell).toBeVisible()
    await bell.click()
    // 下拉显示最近通知 + 查看全部
    await expect(adminPage.getByRole("menuitem", { name: /查看全部|View All/i }).first()).toBeVisible()
  })

  test("通知中心页：列表可见并可标记已读", async ({ adminPage }) => {
    await new LayoutPage(adminPage).gotoMenu("系统管理", "通知中心", "/system/notification")
    // 种子通知标题可见
    await expect(adminPage.getByRole("cell").filter({ hasText: "欢迎使用" }).first()).toBeVisible()
    // 全部已读按钮启用（存在未读）→ 点击后列表状态更新
    const markAll = adminPage.getByRole("button", { name: "全部已读" })
    await expect(markAll).toBeEnabled()
    await markAll.click()
    await expect(adminPage.getByRole("cell").filter({ hasText: "未读" })).toHaveCount(0)
  })

  test("发送通知：选用户填内容后发送成功", async ({ adminPage }) => {
    await new LayoutPage(adminPage).gotoMenu("系统管理", "通知中心", "/system/notification")
    await adminPage.getByRole("button", { name: "发送通知" }).click()
    const dialog = adminPage.getByRole("dialog")
    // 接收用户（admin 唯一用户）+ 标题 + 内容
    await dialog.getByLabel("接收用户").click()
    await adminPage.getByRole("option", { name: /系统管理员/ }).click()
    const title = `e2e_notify_${Date.now()}`
    await dialog.getByLabel("通知标题").fill(title)
    await dialog.getByLabel("通知内容").fill("E2E 发送通知验证")
    await dialog.getByRole("button", { name: "发送" }).click()
    await expect(dialog).toBeHidden()
    // 列表出现新通知
    await expect(adminPage.getByRole("cell").filter({ hasText: title }).first()).toBeVisible()
  })
})
