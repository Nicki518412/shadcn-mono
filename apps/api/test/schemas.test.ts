import { beforeAll, describe, expect, it } from "vitest"
import type { z } from "zod"
import { prisma } from "@repo/db"
import type { MenuNode } from "@repo/shared"
import { createApp } from "../src/index.js"
import { menuNodeSchema } from "../src/lib/schemas.js"
import { createTestUser } from "./helpers.js"

interface ReferenceObjectLike {
  $ref: string
}

const USERNAME = "schemas_test"
const PASSWORD = "Passw0rd!"

async function loginAs(username: string): Promise<string> {
  const app = createApp()
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  })
  if (res.status !== 200) throw new Error(`登录失败: ${String(res.status)}`)
  const body = (await res.json()) as { data: { accessToken: string } }
  return body.data.accessToken
}

describe("schemas", () => {
  beforeAll(async () => {
    await createTestUser({ username: USERNAME, password: PASSWORD })
    const user = await prisma.user.findUnique({ where: { username: USERNAME } })
    if (!user) throw new Error("测试用户未创建")
    const role = await prisma.role.create({ data: { name: "全量授权", code: "SCHEMA_ROLE" } })
    const d1 = await prisma.menu.create({ data: { name: "系统管理", type: "DIR", sort: 1 } })
    const m1 = await prisma.menu.create({
      data: {
        name: "用户管理",
        type: "MENU",
        path: "/system/user",
        component: "system/user",
        icon: "Users",
        permission: "system:user:query",
        parentId: d1.id,
        sort: 1,
      },
    })
    const b1 = await prisma.menu.create({
      data: { name: "新增用户", type: "BUTTON", permission: "system:user:add", parentId: m1.id, sort: 1 },
    })
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })
    await prisma.roleMenu.createMany({
      data: [
        { roleId: role.id, menuId: d1.id },
        { roleId: role.id, menuId: m1.id },
        { roleId: role.id, menuId: b1.id },
      ],
    })
  })

  it("menuNodeSchema 解析真实 me 响应 navTree（运行时形状校验接线）", async () => {
    const app = createApp()
    const token = await loginAs(USERNAME)
    const res = await app.request("/api/auth/me", { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { navTree: MenuNode[] } }
    expect(() => menuNodeSchema.array().parse(body.data.navTree)).not.toThrow()
  })

  it("openapi MenuNode 组件字段与 menuNodeSchema 一致（防形状漂移）", () => {
    const app = createApp()
    const doc = app.getOpenAPIDocument({ openapi: "3.0.0", info: { title: "t", version: "1" } })
    const component = doc.components?.schemas?.MenuNode as
      | { properties?: Record<string, unknown> }
      | ReferenceObjectLike
      | undefined
    if (!component || "$ref" in component) throw new Error("MenuNode 组件缺失或为引用")
    const inner = (menuNodeSchema as z.ZodLazy<z.ZodType<MenuNode>>)._def.getter() as unknown as z.ZodObject<
      Record<string, z.ZodTypeAny>
    >
    expect(Object.keys(component.properties ?? {}).sort()).toEqual(Object.keys(inner.shape).sort())
  })

  it("openapi me 响应 navTree 引用 MenuNode 递归组件", () => {
    const app = createApp()
    const doc = app.getOpenAPIDocument({ openapi: "3.0.0", info: { title: "t", version: "1" } })
    const schemas = doc.components?.schemas ?? {}
    const meResp = schemas.MeResponse as { properties?: { navTree?: { items?: Record<string, unknown> } } } | undefined
    // toMatchObject：OAS 3.0 下 $ref 的兄弟键（如 nullable）被忽略，不锁定兄弟键
    expect(meResp?.properties?.navTree?.items).toMatchObject({ $ref: "#/components/schemas/MenuNode" })
    const menuNode = schemas.MenuNode as { properties?: { children?: { items?: Record<string, unknown> } } } | undefined
    expect(menuNode?.properties?.children?.items).toEqual({ $ref: "#/components/schemas/MenuNode" })
  })
})
