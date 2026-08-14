import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { z } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { createApp } from "../src/index.js"
import { hashPassword } from "@repo/db"
import type { importResultSchema } from "../src/lib/schemas.js"
import { parseCsv } from "../src/lib/csv.js"
import { loginAs, upsertMenu } from "./helpers.js"

const ADMIN_USERNAME = "iex_admin"
const NO_PERM_USERNAME = "iex_noperm"
const PASSWORD = "Passw0rd!"

type ImportResult = z.infer<typeof importResultSchema>

function csvFormData(csvText: string): FormData {
  const form = new FormData()
  form.append("file", new File([csvText], "users.csv", { type: "text/csv" }))
  return form
}

const HEADER = "用户名,密码,昵称,邮箱,手机号,状态,角色"

describe("用户 CSV 导入导出", () => {
  beforeAll(async () => {
    // 管理员：iex_admin + IEX_ADMIN 角色（挂 system:user:query / system:user:create）
    const admin = await prisma.user.create({
      data: { username: ADMIN_USERNAME, passwordHash: await hashPassword(PASSWORD), nickname: "导入导出管理员" },
    })
    const role = await prisma.role.create({ data: { nameZh: "导入导出管理员", code: "IEX_ADMIN" } })
    const dir = await prisma.menu.create({ data: { nameZh: "系统管理", type: "DIR", icon: "Settings", sort: 1 } })
    const mUser = await upsertMenu({
      nameZh: "用户管理", type: "MENU", permission: "system:user:query", path: "/system/user",
      component: "system/user", parentId: dir.id, sort: 1,
    })
    const bCreate = await upsertMenu({ nameZh: "用户新增", type: "BUTTON", permission: "system:user:create", parentId: mUser.id, sort: 1 })
    await prisma.roleMenu.createMany({
      data: [dir, mUser, bCreate].map((menu) => ({ roleId: role.id, menuId: menu.id })),
    })
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })

    // 无权限用户：iex_noperm + 空角色（导出/导入均 403）
    const noperm = await prisma.user.create({
      data: { username: NO_PERM_USERNAME, passwordHash: await hashPassword(PASSWORD), nickname: "无权限" },
    })
    const nopermRole = await prisma.role.create({ data: { nameZh: "无权限", code: "IEX_NOPERM" } })
    await prisma.userRole.create({ data: { userId: noperm.id, roleId: nopermRole.id } })
  })

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: "iex_crud_" } } })
  })

  it("导出：UTF-8 BOM + 表头列 + 数据行；含逗号/引号的字段正确转义", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, PASSWORD)
    await prisma.user.create({
      data: { username: "iex_crud_zhangsan", passwordHash: await hashPassword(PASSWORD), nickname: "张三,销售\"部\"", email: "zs@example.com" },
    })
    const res = await app.request("/api/users/export", { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/csv")
    // UTF-8 BOM \u65AD\u8A00\u539F\u59CB\u5B57\u8282\uFF08EF BB BF\uFF09\uFF1Ares.text() \u7ECF TextDecoder \u89E3\u7801\u4F1A\u5265\u79BB BOM
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder().decode(bytes.slice(3))
    const rows = parseCsv(text)
    expect(rows[0]).toEqual(["用户名", "密码", "昵称", "邮箱", "手机号", "状态", "角色"])
    const target = rows.find((row) => row[0] === "iex_crud_zhangsan")
    expect(target).toBeDefined()
    expect(target?.[1]).toBe("") // 密码列导出为空（安全）
    expect(target?.[2]).toBe('张三,销售"部"')
    expect(target?.[3]).toBe("zs@example.com")
    expect(target?.[5]).toBe("启用")
  })

  it("导出：keyword 过滤生效（与列表一致）", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, PASSWORD)
    await Promise.all([
      prisma.user.create({ data: { username: "iex_crud_kw1", passwordHash: await hashPassword(PASSWORD), nickname: "关键词用户" } }),
      prisma.user.create({ data: { username: "iex_crud_kw2", passwordHash: await hashPassword(PASSWORD), nickname: "其他用户" } }),
    ])
    const res = await app.request(`/api/users/export?keyword=${encodeURIComponent("关键词")}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const bytes = new Uint8Array(await res.arrayBuffer())
    const text = new TextDecoder().decode(bytes.slice(3)) // 跳过 UTF-8 BOM（EF BB BF）
    const rows = parseCsv(text)
    const usernames = rows.slice(1).map((row) => row[0])
    expect(usernames).toContain("iex_crud_kw1")
    expect(usernames).not.toContain("iex_crud_kw2")
  })

  it("导入：成功行创建、失败行收集明细（校验错误 + 唯一冲突 + 空行跳过）", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, PASSWORD)
    await prisma.user.create({
      data: { username: "iex_crud_existing", passwordHash: await hashPassword(PASSWORD), nickname: "已存在" },
    })
    const csvText = [
      HEADER,
      "iex_crud_ok1,Passw0rd!,正常用户,zs@example.com,13800138000",
      "bad,short,太短密码,not-email,1", // 密码/邮箱/手机号均不合法
      "iex_crud_existing,Passw0rd!,重复用户名,,", // 唯一冲突
      "iex_crud_ok2,Passw0rd!,逗号\"引号\"用户,\"含,逗号@example.com\",", // 引号转义
      "", // 空行跳过
    ].join("\r\n")
    const res = await app.request("/api/users/import", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: csvFormData(csvText),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: ImportResult }
    expect(body.data.successCount).toBe(2)
    expect(body.data.failedRows).toHaveLength(2)
    const rowNumbers = body.data.failedRows.map((item) => item.row)
    expect(rowNumbers).toContain(3) // 第 3 行：校验失败
    expect(rowNumbers).toContain(4) // 第 4 行：唯一冲突
    expect(body.data.failedRows.some((item) => item.message.includes("密码"))).toBe(true)
    expect(body.data.failedRows.some((item) => item.message.includes("已存在"))).toBe(true)
    // 落库断言
    const created = await prisma.user.findUnique({ where: { username: "iex_crud_ok1" } })
    expect(created?.nickname).toBe("正常用户")
    const escaped = await prisma.user.findUnique({ where: { username: "iex_crud_ok2" } })
    expect(escaped?.email).toBe("含,逗号@example.com")
  })

  it("导入：表头不匹配 400；空文件 400；超 200 行 400；未登录 401；无权限 403", async () => {
    // 组合用例含 2 次 scrypt 登录 + 多请求，放宽超时（Windows 上 scrypt N=32768 单次可达 500ms+）
    const app = createApp()
    // 复用 token（scrypt 登录较慢，避免组合用例超时）
    const adminAuth = { authorization: `Bearer ${await loginAs(ADMIN_USERNAME, PASSWORD)}` }
    // 表头错误
    const badHeader = await app.request("/api/users/import", {
      method: "POST",
      headers: adminAuth,
      body: csvFormData("姓名,口令,名称\r\na,b,c"),
    })
    expect(badHeader.status).toBe(400)
    expect(((await badHeader.json()) as { message: string }).message).toContain("表头")
    // 无数据行
    const empty = await app.request("/api/users/import", {
      method: "POST",
      headers: adminAuth,
      body: csvFormData(HEADER),
    })
    expect(empty.status).toBe(400)
    // 超行数限制（201 行数据；注意数据行不能含未配对引号——CSV 引号模式会吞并后续行）
    const manyRows = [HEADER, ...Array.from({ length: 201 }, (_, index) => `iex_crud_too${String(index)},Passw0rd!,批量,,`)].join("\r\n")
    const tooMany = await app.request("/api/users/import", {
      method: "POST",
      headers: adminAuth,
      body: csvFormData(manyRows),
    })
    expect(tooMany.status).toBe(400)
    expect(((await tooMany.json()) as { message: string }).message).toContain("200")
    // 未登录
    expect((await app.request("/api/users/export")).status).toBe(401)
    expect((await app.request("/api/users/import", { method: "POST" })).status).toBe(401)
    // 无权限
    const nopermAuth = { authorization: `Bearer ${await loginAs(NO_PERM_USERNAME, PASSWORD)}` }
    expect((await app.request("/api/users/export", { headers: nopermAuth })).status).toBe(403)
    expect((await app.request("/api/users/import", {
      method: "POST",
      headers: nopermAuth,
      body: csvFormData(`${HEADER}\r\niex_crud_hack,Passw0rd!,越权,,"`),
    })).status).toBe(403)
    expect(await prisma.user.count({ where: { username: "iex_crud_hack" } })).toBe(0)
  }, 20000)
})
