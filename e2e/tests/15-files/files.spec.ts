import { expect } from "@playwright/test"
import { API_BASE_URL, test } from "../../fixtures"
import { LayoutPage } from "../../pages/layout"

/** 1x1 透明 PNG（内存构造，免磁盘 fixture 文件；仅需通过 MIME 白名单与 2MB 限制） */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

/**
 * 文件与头像类目：头像上传端到端旅程（business-rules 此前标注「待补」）。
 * 上传为即时行为（选择即 POST /api/files），保存时随个人资料提交文件名。
 */
test.describe("文件与头像", () => {
  test("头像上传：选择即上传出预览，保存后 me.avatar 生效且文件可鉴权访问", async ({ adminPage }) => {
    const layout = new LayoutPage(adminPage)
    await layout.openUserMenu()
    await adminPage.getByRole("menuitem", { name: /用户设置|User settings/i }).click()
    const dialog = adminPage.getByRole("dialog")

    // 选择头像 → 立即上传（POST /api/files）→ 预览图出现
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: PNG_1PX,
    })
    await expect(dialog.getByAltText(/头像|Avatar/)).toBeVisible()

    // 保存（资料字段未改动，仅提交头像文件名）
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()

    // 服务端校验：me.avatar 已更新，且头像文件可鉴权访问（image/png）
    const loginRes = await adminPage.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const loginBody = (await loginRes.json()) as { data: { accessToken: string } }
    const meRes = await adminPage.request.get(`${API_BASE_URL}/api/auth/me`, {
      headers: { authorization: `Bearer ${loginBody.data.accessToken}` },
    })
    expect(meRes.status()).toBe(200)
    // me 响应结构：data.user.avatar（UserPublic 嵌套在 user 下）
    const meBody = (await meRes.json()) as { data: { user: { avatar: string | null } } }
    const savedAvatar = meBody.data.user.avatar
    expect(savedAvatar).not.toBeNull()

    const fileRes = await adminPage.request.get(`${API_BASE_URL}/api/files/${String(savedAvatar)}`, {
      headers: { authorization: `Bearer ${loginBody.data.accessToken}` },
    })
    expect(fileRes.status()).toBe(200)
    expect(fileRes.headers()["content-type"]).toContain("image/png")

    // 清理：还原头像为 null，保持共享 e2e 库干净（不影响其它用例断言，但避免累积脏数据）
    const clearRes = await adminPage.request.patch(`${API_BASE_URL}/api/users/me`, {
      headers: { authorization: `Bearer ${loginBody.data.accessToken}` },
      data: { avatar: null },
    })
    expect(clearRes.status()).toBe(200)
  })
})
