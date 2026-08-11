import { expect } from "@playwright/test"
import { test } from "../../fixtures"
import { LayoutPage } from "../../pages/layout"

/**
 * 个人资料类目：用户设置弹窗（修改昵称/邮箱/手机号 + 修改密码）。
 */
test.describe("个人资料", () => {
  test("用户设置：修改昵称后侧边栏同步更新", async ({ adminPage }) => {
    const layout = new LayoutPage(adminPage)
    await layout.openUserMenu()
    await adminPage.getByRole("menuitem", { name: /用户设置|User settings/i }).click()
    const dialog = adminPage.getByRole("dialog")
    const newNickname = `E2E 昵称 ${Date.now()}`
    await dialog.getByLabel("昵称").fill(newNickname)
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
    // 侧边栏用户区昵称更新（me 缓存失效重取）
    await expect(adminPage.getByText(newNickname).first()).toBeVisible()
    // 还原昵称（避免污染后续用例断言）
    await layout.openUserMenu()
    await adminPage.getByRole("menuitem", { name: /用户设置|User settings/i }).click()
    await dialog.getByLabel("昵称").fill("系统管理员")
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
  })

  test("修改密码：新密码登录成功，旧密码失效", async ({ adminPage }) => {
    const layout = new LayoutPage(adminPage)
    await layout.openUserMenu()
    await adminPage.getByRole("menuitem", { name: /用户设置|User settings/i }).click()
    const dialog = adminPage.getByRole("dialog")
    const newPassword = "NewPassw0rd!"
    await dialog.getByLabel("当前密码").fill("Admin@123")
    await dialog.getByLabel("新密码").fill(newPassword)
    await dialog.getByRole("button", { name: "保存" }).click()
    // 修改密码成功后吊销全部会话 → 主动登出回登录页
    await expect(adminPage).toHaveURL(/\/login/)

    // 新密码登录成功
    const newLogin = await adminPage.request.post("http://localhost:3001/api/auth/login", {
      data: { username: "admin", password: newPassword },
    })
    expect(newLogin.status()).toBe(200)
    // 旧密码失效
    const oldLogin = await adminPage.request.post("http://localhost:3001/api/auth/login", {
      data: { username: "admin", password: "Admin@123" },
    })
    expect(oldLogin.status()).toBe(401)
    // 还原密码（global-setup 每次运行重建库，本用例需保持后续用例可用：还原 Admin@123）
    const restoreLogin = await adminPage.request.post("http://localhost:3001/api/auth/login", {
      data: { username: "admin", password: newPassword },
    })
    const restoreBody = (await restoreLogin.json()) as { data: { accessToken: string } }
    const changeRes = await adminPage.request.post("http://localhost:3001/api/auth/change-password", {
      headers: { authorization: `Bearer ${restoreBody.data.accessToken}` },
      data: { currentPassword: newPassword, newPassword: "Admin@123" },
    })
    expect(changeRes.status()).toBe(200)
  })
})
