import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { z } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { createApp } from "../src/index.js"
import { hashPassword } from "@repo/db"
import { loginAs, upsertMenu } from "./helpers.js"
import type { configDetailSchema, configPageResultSchema } from "../src/lib/schemas.js"

const ADMIN_USERNAME = "cfgs_admin"
const ADMIN_PASSWORD = "Passw0rd!"
const NO_PERM_USERNAME = "cfgs_noperm"

interface PageBody {
  data: z.infer<typeof configPageResultSchema>
}
type ConfigDetail = z.infer<typeof configDetailSchema>

describe("configs CRUD", () => {
  beforeAll(async () => {
    // 管理员：cfgs_admin + CFGS_ADMIN 角色（菜单树按权限码复用/补齐 system:config:* 码）
    const admin = await prisma.user.create({
      data: { username: ADMIN_USERNAME, passwordHash: await hashPassword(ADMIN_PASSWORD), nickname: "参数管理员" },
    })
    const role = await prisma.role.create({ data: { nameZh: "参数管理员", code: "CFGS_ADMIN" } })
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })

    const dir = await prisma.menu.create({ data: { nameZh: "系统管理", type: "DIR", icon: "Settings", sort: 1 } })
    const mConfig = await upsertMenu({
      nameZh: "参数配置", type: "MENU", permission: "system:config:query", path: "/system/config",
      component: "system/config", parentId: dir.id, sort: 7,
    })
    const bCreate = await upsertMenu({ nameZh: "参数新增", type: "BUTTON", permission: "system:config:create", parentId: mConfig.id, sort: 1 })
    const bUpdate = await upsertMenu({ nameZh: "参数编辑", type: "BUTTON", permission: "system:config:update", parentId: mConfig.id, sort: 2 })
    const bDelete = await upsertMenu({ nameZh: "参数删除", type: "BUTTON", permission: "system:config:delete", parentId: mConfig.id, sort: 3 })
    await prisma.roleMenu.createMany({
      data: [dir, mConfig, bCreate, bUpdate, bDelete].map((menu) => ({ roleId: role.id, menuId: menu.id })),
    })

    // 无权限用户：cfgs_noperm + 空角色（任何 config 接口都 403）
    const nopermUser = await prisma.user.create({
      data: { username: NO_PERM_USERNAME, passwordHash: await hashPassword(ADMIN_PASSWORD), nickname: "参数无权限用户" },
    })
    const nopermRole = await prisma.role.create({ data: { nameZh: "参数无权限", code: "CFGS_NOPERM" } })
    await prisma.userRole.create({ data: { userId: nopermUser.id, roleId: nopermRole.id } })
  })

  // 清理上个用例留下的 cfg_crud_ 参数与用户，避免测试间污染；
  // SQLite LIKE 对 ASCII 大小写不敏感且 _ 为通配符，故前缀用 cfg_crud_ 与管理员 cfgs_admin 严格区分
  beforeEach(async () => {
    await prisma.config.deleteMany({ where: { configKey: { startsWith: "cfg_crud_" } } })
    await prisma.user.deleteMany({ where: { username: { startsWith: "cfg_crud" } } })
  })

  it("创建参数：返回详情；重复 configKey（大小写变体）409 且 message 含“参数键”", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }
    const create = await app.request("/api/configs", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ configKey: "cfg_crud_min_len", configValue: "8", nameZh: "密码最小长度", nameEn: "Min Length" }),
    })
    expect(create.status).toBe(200)
    const body = (await create.json()) as { data: ConfigDetail }
    expect(body.data.configKey).toBe("cfg_crud_min_len")
    expect(body.data.configValue).toBe("8")
    expect(body.data.nameZh).toBe("密码最小长度")
    expect(body.data.nameEn).toBe("Min Length")
    expect(body.data.status).toBe(true)
    const stored = await prisma.config.findUnique({ where: { configKey: "cfg_crud_min_len" } })
    expect(stored?.configValue).toBe("8")

    const dup = await app.request("/api/configs", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ configKey: "CFG_CRUD_MIN_LEN", configValue: "1", nameZh: "重复" }),
    })
    expect(dup.status).toBe(409)
    expect(((await dup.json()) as { message: string }).message).toContain("参数键")
  })

  it("更新参数：PATCH 改值/改名/禁用/清空说明/改 configKey（大小写变体）；configKey 撞已存在参数 409 不落库", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }
    const config = await prisma.config.create({
      data: { configKey: "cfg_crud_patch1", configValue: "old", nameZh: "旧名", description: "原始说明", status: true },
    })
    const res = await app.request(`/api/configs/${config.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ configValue: "new", nameZh: "新名", nameEn: "New En", status: false, description: null, configKey: "CFG_CRUD_PATCH2" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: ConfigDetail }
    expect(body.data.configValue).toBe("new")
    expect(body.data.nameZh).toBe("新名")
    expect(body.data.nameEn).toBe("New En")
    expect(body.data.status).toBe(false)
    expect(body.data.description).toBeNull()
    // configKey 统一小写存储（程序引用键去大小写歧义）
    expect(body.data.configKey).toBe("cfg_crud_patch2")
    const stored = await prisma.config.findUnique({ where: { id: config.id } })
    expect(stored?.configValue).toBe("new")
    expect(stored?.description).toBeNull()

    // PATCH configKey 撞已存在参数（大小写变体同约束）→ 409，且目标参数键不落库
    const other = await prisma.config.create({ data: { configKey: "cfg_crud_patch3", configValue: "v", nameZh: "冲突目标" } })
    const dup = await app.request(`/api/configs/${other.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ configKey: "cfg_crud_patch2" }),
    })
    expect(dup.status).toBe(409)
    expect(((await dup.json()) as { message: string }).message).toContain("参数键")
    expect((await prisma.config.findUnique({ where: { id: other.id } }))?.configKey).toBe("cfg_crud_patch3")
  })

  it("删除参数；不存在的 id GET/PATCH/DELETE 返回 404", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const auth = { authorization: `Bearer ${token}` }
    const config = await prisma.config.create({ data: { configKey: "cfg_crud_del", configValue: "v", nameZh: "待删参数" } })
    const del = await app.request(`/api/configs/${config.id}`, { method: "DELETE", headers: auth })
    expect(del.status).toBe(200)
    expect(await prisma.config.findUnique({ where: { id: config.id } })).toBeNull()

    const missing = "no_such_config_id"
    const get = await app.request(`/api/configs/${missing}`, { headers: auth })
    expect(get.status).toBe(404)
    const patch = await app.request(`/api/configs/${missing}`, {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ nameZh: "不存在" }),
    })
    expect(patch.status).toBe(404)
    const delMissing = await app.request(`/api/configs/${missing}`, { method: "DELETE", headers: auth })
    expect(delMissing.status).toBe(404)
  })

  it("分页列表：page/pageSize 生效、total 正确；keyword 匹配 configKey 与 nameZh", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const auth = { authorization: `Bearer ${token}` }
    await Promise.all([
      prisma.config.create({ data: { configKey: "cfg_crud_kw1", configValue: "a", nameZh: "关键词一号" } }),
      prisma.config.create({ data: { configKey: "cfg_crud_kw2", configValue: "b", nameZh: "关键词二号" } }),
      prisma.config.create({ data: { configKey: "cfg_crud_kw3", configValue: "c", nameZh: "唯一参数" } }),
    ])
    const page = await app.request("/api/configs?page=1&pageSize=2", { headers: auth })
    expect(page.status).toBe(200)
    const pageBody = (await page.json()) as PageBody
    expect(pageBody.data.list).toHaveLength(2)
    expect(pageBody.data.total).toBeGreaterThanOrEqual(3)
    const byKey = await app.request(`/api/configs?page=1&pageSize=10&keyword=${encodeURIComponent("cfg_crud_kw2")}`, {
      headers: auth,
    })
    expect(byKey.status).toBe(200)
    expect(((await byKey.json()) as PageBody).data.total).toBe(1)
    const byName = await app.request(`/api/configs?page=1&pageSize=10&keyword=${encodeURIComponent("唯一参数")}`, {
      headers: auth,
    })
    expect(byName.status).toBe(200)
    expect(((await byName.json()) as PageBody).data.total).toBe(1)
  })

  it("权限：未登录 401；无 system:config:query 权限的用户 403；越权创建不落库", async () => {
    const app = createApp()
    const anonymous = await app.request("/api/configs")
    expect(anonymous.status).toBe(401)
    const nopermLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: NO_PERM_USERNAME, password: ADMIN_PASSWORD }),
    })
    const nopermBody = (await nopermLogin.json()) as { data: { accessToken: string } }
    const nopermToken = nopermBody.data.accessToken
    const list = await app.request("/api/configs", { headers: { authorization: `Bearer ${nopermToken}` } })
    expect(list.status).toBe(403)
    expect(((await list.json()) as { code: string }).code).toBe("PERMISSION_DENIED")
    const create = await app.request("/api/configs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${nopermToken}` },
      body: JSON.stringify({ configKey: "cfg_crud_hack", configValue: "1", nameZh: "越权" }),
    })
    expect(create.status).toBe(403)
    expect(await prisma.config.count({ where: { configKey: "cfg_crud_hack" } })).toBe(0)
  })

  it("pageSize 超过上限 100 返回 400", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const res = await app.request("/api/configs?page=1&pageSize=101", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(400)
  })
})
