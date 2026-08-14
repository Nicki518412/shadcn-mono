import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { z } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { createApp } from "../src/index.js"
import { hashPassword } from "@repo/db"
import { loginAs, upsertMenu } from "./helpers.js"
import type { dictOptionSchema, dictTypeDetailSchema, dictTypePageResultSchema } from "../src/lib/schemas.js"

const ADMIN_USERNAME = "dicts_admin"
const ADMIN_PASSWORD = "Passw0rd!"
const NO_PERM_USERNAME = "dicts_noperm"

interface PageBody {
  data: z.infer<typeof dictTypePageResultSchema>
}
type DictTypeDetail = z.infer<typeof dictTypeDetailSchema>
type DictOption = z.infer<typeof dictOptionSchema>

describe("dicts CRUD", () => {
  beforeAll(async () => {
    // 管理员：dicts_admin + DICTS_ADMIN 角色（菜单树按权限码复用/补齐 system:dict:* 码）
    const admin = await prisma.user.create({
      data: { username: ADMIN_USERNAME, passwordHash: await hashPassword(ADMIN_PASSWORD), nickname: "字典管理员" },
    })
    const role = await prisma.role.create({ data: { nameZh: "字典管理员", code: "DICTS_ADMIN" } })
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } })

    const dir = await prisma.menu.create({ data: { nameZh: "系统管理", type: "DIR", icon: "Settings", sort: 1 } })
    const mDict = await upsertMenu({
      nameZh: "数据字典", type: "MENU", permission: "system:dict:query", path: "/system/dict",
      component: "system/dict", parentId: dir.id, sort: 6,
    })
    const bCreate = await upsertMenu({ nameZh: "字典新增", type: "BUTTON", permission: "system:dict:create", parentId: mDict.id, sort: 1 })
    const bUpdate = await upsertMenu({ nameZh: "字典编辑", type: "BUTTON", permission: "system:dict:update", parentId: mDict.id, sort: 2 })
    const bDelete = await upsertMenu({ nameZh: "字典删除", type: "BUTTON", permission: "system:dict:delete", parentId: mDict.id, sort: 3 })
    await prisma.roleMenu.createMany({
      data: [dir, mDict, bCreate, bUpdate, bDelete].map((menu) => ({ roleId: role.id, menuId: menu.id })),
    })

    // 无权限用户：dicts_noperm + 空角色（任何 dict 接口都 403）
    const nopermUser = await prisma.user.create({
      data: { username: NO_PERM_USERNAME, passwordHash: await hashPassword(ADMIN_PASSWORD), nickname: "字典无权限用户" },
    })
    const nopermRole = await prisma.role.create({ data: { nameZh: "字典无权限", code: "DICTS_NOPERM" } })
    await prisma.userRole.create({ data: { userId: nopermUser.id, roleId: nopermRole.id } })
  })

  // 清理上个用例留下的 dict_crud_ 类型（级联清字典项）与用户，避免测试间污染；
  // SQLite LIKE 对 ASCII 大小写不敏感且 _ 为通配符，故前缀用 dict_crud_ 与管理员 dicts_admin 严格区分
  beforeEach(async () => {
    await prisma.dictType.deleteMany({ where: { typeCode: { startsWith: "dict_crud_" } } })
    await prisma.user.deleteMany({ where: { username: { startsWith: "dict_crud" } } })
  })

  it("创建字典类型：返回列表项 itemCount=0；重复 typeCode（大小写变体）409 且 message 含“字典”", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }
    const create = await app.request("/api/dicts/types", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ typeCode: "dict_crud_user_status", nameZh: "用户状态", nameEn: "User Status", sort: 1 }),
    })
    expect(create.status).toBe(200)
    const body = (await create.json()) as { data: { typeCode: string; nameZh: string; nameEn: string | null; sort: number; itemCount: number } }
    expect(body.data.typeCode).toBe("dict_crud_user_status")
    expect(body.data.nameZh).toBe("用户状态")
    expect(body.data.nameEn).toBe("User Status")
    expect(body.data.sort).toBe(1)
    expect(body.data.itemCount).toBe(0)
    const stored = await prisma.dictType.findUnique({ where: { typeCode: "dict_crud_user_status" } })
    expect(stored?.nameZh).toBe("用户状态")

    const dup = await app.request("/api/dicts/types", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ typeCode: "DICT_CRUD_USER_STATUS", nameZh: "重复" }),
    })
    expect(dup.status).toBe(409)
    expect(((await dup.json()) as { message: string }).message).toContain("字典")
  })

  it("字典项 PUT 全量替换：GET 详情回显一致且按 sort 升序；空值/重复值 400；不存在的类型 404", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }
    const type = await prisma.dictType.create({ data: { typeCode: "dict_crud_items", nameZh: "字典项测试" } })
    // 打乱 sort 顺序验证详情按 sort 升序返回
    const put = await app.request(`/api/dicts/types/${type.id}/items`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({
        items: [
          { labelZh: "禁用", labelEn: "Disabled", value: "disabled", sort: 2 },
          { labelZh: "启用", labelEn: "Enabled", value: "enabled", sort: 1 },
        ],
      }),
    })
    expect(put.status).toBe(200)
    const detail = await app.request(`/api/dicts/types/${type.id}`, { headers: { authorization: `Bearer ${token}` } })
    expect(detail.status).toBe(200)
    const detailBody = (await detail.json()) as { data: DictTypeDetail }
    expect(detailBody.data.items.map((item) => item.value)).toEqual(["enabled", "disabled"])
    expect(detailBody.data.items[0]?.labelEn).toBe("Enabled")
    expect(detailBody.data.items[1]?.status).toBe(true)
    const stored = await prisma.dictItem.findMany({ where: { typeId: type.id } })
    expect(stored).toHaveLength(2)

    // 空 value → 400（zod min(1) 分支）
    const empty = await app.request(`/api/dicts/types/${type.id}/items`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ items: [{ labelZh: "空值", value: "" }] }),
    })
    expect(empty.status).toBe(400)
    // 重复 value → 400（应用层去重校验）
    const dup = await app.request(`/api/dicts/types/${type.id}/items`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ items: [{ labelZh: "重复一", value: "same" }, { labelZh: "重复二", value: "same" }] }),
    })
    expect(dup.status).toBe(400)
    expect(((await dup.json()) as { message: string }).message).toContain("重复")
    // 全量替换语义：仅剩 1 项
    const replace = await app.request(`/api/dicts/types/${type.id}/items`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ items: [{ labelZh: "仅剩项", value: "only" }] }),
    })
    expect(replace.status).toBe(200)
    expect(await prisma.dictItem.count({ where: { typeId: type.id } })).toBe(1)

    // 不存在的类型 → 404
    const missing = await app.request("/api/dicts/types/no_such_id/items", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ items: [] }),
    })
    expect(missing.status).toBe(404)
  })

  it("options 接口：仅返回启用项且按 sort 升序；未知 typeCode 404", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const type = await prisma.dictType.create({ data: { typeCode: "dict_crud_opts", nameZh: "选项测试" } })
    await prisma.dictItem.createMany({
      data: [
        { typeId: type.id, labelZh: "禁用项", value: "disabled", sort: 1, status: false },
        { typeId: type.id, labelZh: "启用二", value: "second", sort: 2 },
        { typeId: type.id, labelZh: "启用一", value: "first", sort: 1 },
      ],
    })
    const res = await app.request("/api/dicts/types/dict_crud_opts/options", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: DictOption[] }
    expect(body.data).toEqual([
      { value: "first", labelZh: "启用一", labelEn: null, sort: 1 },
      { value: "second", labelZh: "启用二", labelEn: null, sort: 2 },
    ])

    const missing = await app.request("/api/dicts/types/no_such_code/options", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(missing.status).toBe(404)
  })

  it("更新字典类型：PATCH 改名/改状态/清空描述/改 typeCode（大小写变体）；typeCode 撞已存在类型 409 不落库", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }
    const type = await prisma.dictType.create({
      data: { typeCode: "dict_crud_patch1", nameZh: "旧名", description: "原始描述", sort: 1 },
    })
    const res = await app.request(`/api/dicts/types/${type.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ nameZh: "新名", nameEn: "New En", status: false, description: null, typeCode: "DICT_CRUD_PATCH2" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: DictTypeDetail }
    expect(body.data.nameZh).toBe("新名")
    expect(body.data.nameEn).toBe("New En")
    expect(body.data.status).toBe(false)
    expect(body.data.description).toBeNull()
    // typeCode 统一小写存储（与 roles 的 code 大写规范化对称，程序引用键去大小写歧义）
    expect(body.data.typeCode).toBe("dict_crud_patch2")
    const stored = await prisma.dictType.findUnique({ where: { id: type.id } })
    expect(stored?.typeCode).toBe("dict_crud_patch2")
    expect(stored?.description).toBeNull()

    // PATCH typeCode 撞已存在类型（大小写变体同约束）→ 409，且目标类型编码不落库
    const other = await prisma.dictType.create({ data: { typeCode: "dict_crud_patch3", nameZh: "冲突目标" } })
    const dup = await app.request(`/api/dicts/types/${other.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ typeCode: "dict_crud_patch2" }),
    })
    expect(dup.status).toBe(409)
    expect(((await dup.json()) as { message: string }).message).toContain("字典")
    expect((await prisma.dictType.findUnique({ where: { id: other.id } }))?.typeCode).toBe("dict_crud_patch3")
  })

  it("删除字典类型：字典项级联清理；不存在的 id GET/PATCH/DELETE 返回 404", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const auth = { authorization: `Bearer ${token}` }
    const type = await prisma.dictType.create({ data: { typeCode: "dict_crud_del", nameZh: "待删类型" } })
    await prisma.dictItem.createMany({
      data: [
        { typeId: type.id, labelZh: "项一", value: "one" },
        { typeId: type.id, labelZh: "项二", value: "two" },
      ],
    })
    const del = await app.request(`/api/dicts/types/${type.id}`, { method: "DELETE", headers: auth })
    expect(del.status).toBe(200)
    expect(await prisma.dictType.findUnique({ where: { id: type.id } })).toBeNull()
    expect(await prisma.dictItem.count({ where: { typeId: type.id } })).toBe(0)

    const missing = "no_such_dict_type"
    const get = await app.request(`/api/dicts/types/${missing}`, { headers: auth })
    expect(get.status).toBe(404)
    const patch = await app.request(`/api/dicts/types/${missing}`, {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ nameZh: "不存在" }),
    })
    expect(patch.status).toBe(404)
    const delMissing = await app.request(`/api/dicts/types/${missing}`, { method: "DELETE", headers: auth })
    expect(delMissing.status).toBe(404)
  })

  it("分页列表：page/pageSize 生效、total 正确、itemCount 统计；keyword 匹配 typeCode 与 nameZh", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const auth = { authorization: `Bearer ${token}` }
    const t1 = await prisma.dictType.create({ data: { typeCode: "dict_crud_kw1", nameZh: "关键词一号", sort: 1 } })
    await prisma.dictItem.create({ data: { typeId: t1.id, labelZh: "子项", value: "child" } })
    await prisma.dictType.create({ data: { typeCode: "dict_crud_kw2", nameZh: "关键词二号", sort: 2 } })
    await prisma.dictType.create({ data: { typeCode: "dict_crud_kw3", nameZh: "唯一类型", sort: 3 } })

    const page = await app.request("/api/dicts/types?page=1&pageSize=2", { headers: auth })
    expect(page.status).toBe(200)
    const pageBody = (await page.json()) as PageBody
    expect(pageBody.data.list).toHaveLength(2)
    expect(pageBody.data.total).toBeGreaterThanOrEqual(3)
    const withItems = pageBody.data.list.find((t) => t.typeCode === "dict_crud_kw1")
    expect(withItems?.itemCount).toBe(1)

    const byCode = await app.request(
      `/api/dicts/types?page=1&pageSize=10&keyword=${encodeURIComponent("dict_crud_kw2")}`,
      { headers: auth },
    )
    expect(byCode.status).toBe(200)
    expect(((await byCode.json()) as PageBody).data.total).toBe(1)
    const byName = await app.request(`/api/dicts/types?page=1&pageSize=10&keyword=${encodeURIComponent("唯一类型")}`, {
      headers: auth,
    })
    expect(byName.status).toBe(200)
    expect(((await byName.json()) as PageBody).data.total).toBe(1)
  })

  it("权限：未登录 401；无 system:dict:query 权限的用户 403", async () => {
    const app = createApp()
    const anonymous = await app.request("/api/dicts/types")
    expect(anonymous.status).toBe(401)
    const nopermLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: NO_PERM_USERNAME, password: ADMIN_PASSWORD }),
    })
    const nopermBody = (await nopermLogin.json()) as { data: { accessToken: string } }
    const nopermToken = nopermBody.data.accessToken
    const list = await app.request("/api/dicts/types", { headers: { authorization: `Bearer ${nopermToken}` } })
    expect(list.status).toBe(403)
    expect(((await list.json()) as { code: string }).code).toBe("PERMISSION_DENIED")
    // 写接口同样 403（权限码不匹配，非 401）
    const create = await app.request("/api/dicts/types", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${nopermToken}` },
      body: JSON.stringify({ typeCode: "dict_crud_hack", nameZh: "越权" }),
    })
    expect(create.status).toBe(403)
    expect(await prisma.dictType.count({ where: { typeCode: "dict_crud_hack" } })).toBe(0)
  })

  it("pageSize 超过上限 100 返回 400", async () => {
    const app = createApp()
    const token = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD)
    const res = await app.request("/api/dicts/types?page=1&pageSize=101", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(400)
  })
})
