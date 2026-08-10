import { afterEach, describe, expect, it } from "vitest"
import i18n from "../src/localization/i18n"
import { menuDisplayName, roleDisplayName } from "../src/localization/menuName"

// setup.ts 已初始化 i18n 并锁定 zh；本文件切换 en 验证后必须还原，避免污染其他用例
describe("menuDisplayName / roleDisplayName", () => {
  afterEach(async () => {
    await i18n.changeLanguage("zh")
  })

  it("zh 语言始终展示数据库原文 name", () => {
    expect(menuDisplayName({ nameZh:"用户管理", nameEn: "Users" })).toBe("用户管理")
    expect(roleDisplayName({ nameZh:"管理员", nameEn: "Administrator" })).toBe("管理员")
  })

  it("en 语言且配置了 nameEn 时展示 nameEn", async () => {
    await i18n.changeLanguage("en")
    expect(menuDisplayName({ nameZh:"用户管理", nameEn: "Users" })).toBe("Users")
    expect(roleDisplayName({ nameZh:"管理员", nameEn: "Administrator" })).toBe("Administrator")
  })

  it("en 语言但未配置 nameEn 时回落 name", async () => {
    await i18n.changeLanguage("en")
    expect(menuDisplayName({ nameZh:"自定义菜单", nameEn: null })).toBe("自定义菜单")
    expect(roleDisplayName({ nameZh:"自定义角色", nameEn: null })).toBe("自定义角色")
  })
})
