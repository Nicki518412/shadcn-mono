import { expect } from "@playwright/test"
import { test } from "../../fixtures"
import { UsersPage } from "../../pages/users"

/**
 * 用户管理类目：CRUD、角色分配、导入导出、禁用登录。
 * 数据使用 e2e_u 前缀（e2e 库每次运行重建，无残留）。
 */
test.describe("用户管理", () => {
  test("创建用户：填表提交后列表可见", async ({ adminPage }) => {
    const users = new UsersPage(adminPage)
    await users.goto()
    const username = "e2e_u_create"
    await users.createUser({ username, password: "Passw0rd!", nickname: "新建用户" })
    await users.searchAndExpect(username, true)
    await expect(adminPage.getByRole("row").filter({ hasText: username })).toContainText("新建用户")
  })

  test("编辑用户：改昵称后列表更新", async ({ adminPage, request }) => {
    const users = new UsersPage(adminPage)
    await users.goto()
    const username = "e2e_u_edit"
    // API 前置创建（UI 已覆盖创建流程，此处聚焦编辑）
    const adminLogin = await request.post("http://localhost:3001/api/auth/login", {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    await request.post("http://localhost:3001/api/users", {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { username, password: "Passw0rd!", nickname: "旧昵称" },
    })
    await users.searchAndExpect(username, true)
    await users.editNickname(username, "新昵称")
    await users.searchAndExpect(username, true)
    await expect(adminPage.getByRole("row").filter({ hasText: username })).toContainText("新昵称")
  })

  test("分配角色：保存后列表显示角色名", async ({ adminPage }) => {
    const users = new UsersPage(adminPage)
    await users.goto()
    const username = "e2e_u_role"
    await users.createUser({ username, password: "Passw0rd!", nickname: "待分配角色" })
    await users.searchAndExpect(username, true)
    await users.assignRoles(username, "访客")
    await expect(adminPage.getByRole("row").filter({ hasText: username })).toContainText("访客")
  })

  test("删除用户：确认后从列表消失", async ({ adminPage }) => {
    const users = new UsersPage(adminPage)
    await users.goto()
    const username = "e2e_u_delete"
    await users.createUser({ username, password: "Passw0rd!", nickname: "待删除" })
    await users.searchAndExpect(username, true)
    await users.deleteUser(username)
    await users.searchAndExpect(username, false)
  })

  test("禁用用户：禁用后无法登录", async ({ adminPage, request }) => {
    const users = new UsersPage(adminPage)
    await users.goto()
    const username = "e2e_u_disabled"
    await users.createUser({ username, password: "Passw0rd!", nickname: "禁用测试" })
    await users.searchAndExpect(username, true)
    await users.setStatus(username, false)
    // 禁用后登录被拒（403 ACCOUNT_DISABLED）
    const login = await request.post("http://localhost:3001/api/auth/login", {
      data: { username, password: "Passw0rd!" },
    })
    expect(login.status()).toBe(403)
    const body = (await login.json()) as { code: string }
    expect(body.code).toBe("ACCOUNT_DISABLED")
  })

  test("导入用户：上传 CSV 创建成功并展示结果", async ({ adminPage }) => {
    const users = new UsersPage(adminPage)
    await users.goto()
    await adminPage.getByRole("button", { name: "导入" }).click()
    const dialog = adminPage.getByRole("dialog")
    // 上传 CSV（表头 + 两行数据，一行成功一行邮箱格式错误）
    const csv = "﻿用户名,密码,昵称,邮箱,手机号,状态,角色\r\n" +
      "e2e_u_imp1,Passw0rd!,导入用户一,imp1@example.com,,\r\n" +
      "e2e_u_imp2,Passw0rd!,导入用户二,bad-email,,\r\n"
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "users.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8"),
    })
    await dialog.getByRole("button", { name: "开始导入" }).click()
    await expect(dialog).toContainText("导入结果")
    await expect(dialog).toContainText("成功 1 条")
    await expect(dialog).toContainText("失败 1 条")
    await dialog.getByRole("button", { name: "关闭" }).click()
    // 导入的用户在列表中
    await users.searchAndExpect("e2e_u_imp1", true)
  })

  test("导出用户：触发 CSV 下载且包含用户名", async ({ adminPage }) => {
    const users = new UsersPage(adminPage)
    await users.goto()
    const downloadPromise = adminPage.waitForEvent("download")
    await adminPage.getByRole("button", { name: "导出" }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe("users.csv")
    const path = await download.path()
    if (!path) throw new Error("导出文件无本地路径")
    const content = await (await import("node:fs/promises")).readFile(path, "utf8")
    expect(content).toContain("用户名")
  })
})
