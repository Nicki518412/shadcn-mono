import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import type { Prisma } from "@repo/db"
import { prisma } from "@repo/db"
import { badRequest, conflict, notFound } from "../lib/http-error.js"
import { createSubApp, okBody } from "../lib/openapi.js"
import { p2002FieldMessage } from "../lib/prisma-error.js"
import { errorBodySchema, roleDetailSchema, roleListItemSchema, rolePageResultSchema } from "../lib/schemas.js"
import { authenticate, requirePermission } from "../middleware/auth.js"

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  keyword: z.string().optional(),
})

const roleCreateSchema = z.object({
  name: z.string().min(1).max(64),
  code: z.string().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/),
  description: z.string().optional(),
  sort: z.number().int().default(0),
  status: z.boolean().optional(),
})

const roleUpdateSchema = roleCreateSchema.partial()

const menuIdsSchema = z.object({ menuIds: z.array(z.string()) })

const idParam = z.object({ id: z.string() })

/** P2002 字段 → 409 message 映射（create/PATCH 共用；code 统一大写存储，大小写变体同样命中唯一约束） */
const ROLE_UNIQUE_FIELDS = {
  code: "角色编码已存在",
} as const

/** 菜单存在性校验 + 去重（不存在 → 400）；事务内调用，保证校验与写入原子（须在 $transaction 回调中使用 tx） */
async function resolveMenuIds(tx: Prisma.TransactionClient, menuIds: string[]): Promise<string[]> {
  const unique = Array.from(new Set(menuIds))
  if (unique.length === 0) return unique
  const count = await tx.menu.count({ where: { id: { in: unique } } })
  if (count !== unique.length) throw badRequest("菜单不存在")
  return unique
}

/** 角色详情；不存在 → 404 */
async function fetchRoleDetail(id: string) {
  const role = await prisma.role.findUnique({ where: { id } })
  if (!role) throw notFound("角色不存在")
  return role
}

type RoleDetail = Awaited<ReturnType<typeof fetchRoleDetail>>

function toRoleDetail(role: RoleDetail) {
  return {
    id: role.id,
    name: role.name,
    code: role.code,
    description: role.description,
    sort: role.sort,
    status: role.status,
    createdAt: role.createdAt,
  }
}

export function roleRoutes(jwtSecret: string): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/roles",
      middleware: [authenticate(jwtSecret), requirePermission("system:role:query")],
      request: { query: pageQuery },
      responses: {
        200: { description: "角色分页列表", ...okBody(rolePageResultSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { page, pageSize, keyword } = c.req.valid("query")
      // keyword contains 三方言决策：SQLite/MySQL 转 LIKE（ASCII 大小写不敏感），PG 下大小写敏感
      // （Prisma mode:insensitive 仅 PG 可用）；LIKE 通配符 %/_ 不转义——管理端模糊搜索接受此行为，不做额外归一
      const where = keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { code: { contains: keyword } },
            ],
          }
        : {}
      const [list, total] = await Promise.all([
        prisma.role.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { sort: "asc" },
        }),
        prisma.role.count({ where }),
      ])
      return c.json({ code: 0, data: { list: list.map(toRoleDetail), total }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/roles/list",
      middleware: [authenticate(jwtSecret), requirePermission("system:role:query")],
      responses: {
        200: { description: "角色全量列表（下拉/分配用，无分页）", ...okBody(z.array(roleListItemSchema)) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const list = await prisma.role.findMany({ orderBy: { sort: "asc" } })
      return c.json({ code: 0, data: list.map(toRoleDetail), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/roles",
      middleware: [authenticate(jwtSecret), requirePermission("system:role:create")],
      request: { body: { content: { "application/json": { schema: roleCreateSchema } } } },
      responses: {
        200: { description: "创建成功（返回详情）", ...okBody(roleDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "角色编码已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { name, code, description, sort, status } = c.req.valid("json")
      // code 统一大写存储（程序判断用编码，与大小写输入解耦）；exactOptionalPropertyTypes：undefined 不传
      const data: Prisma.RoleCreateInput = { name, code: code.toUpperCase(), sort }
      if (description !== undefined) data.description = description
      if (status !== undefined) data.status = status
      try {
        const role = await prisma.role.create({ data })
        return c.json({ code: 0, data: toRoleDetail(role), message: "ok" }, 200)
      } catch (err) {
        const message = p2002FieldMessage(err, ROLE_UNIQUE_FIELDS)
        if (message !== null) throw conflict(message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/roles/{id}",
      middleware: [authenticate(jwtSecret), requirePermission("system:role:query")],
      request: { params: idParam },
      responses: {
        200: { description: "角色详情", ...okBody(roleDetailSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "角色不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      return c.json({ code: 0, data: toRoleDetail(await fetchRoleDetail(id)), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/roles/{id}",
      middleware: [authenticate(jwtSecret), requirePermission("system:role:update")],
      request: { params: idParam, body: { content: { "application/json": { schema: roleUpdateSchema } } } },
      responses: {
        200: { description: "更新成功（返回详情）", ...okBody(roleDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "角色不存在", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "角色编码已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const fields = c.req.valid("json")
      await fetchRoleDetail(id)
      const data: Prisma.RoleUpdateInput = {}
      if (fields.name !== undefined) data.name = fields.name
      if (fields.code !== undefined) data.code = fields.code.toUpperCase()
      if (fields.description !== undefined) data.description = fields.description
      if (fields.sort !== undefined) data.sort = fields.sort
      if (fields.status !== undefined) data.status = fields.status
      try {
        const role = await prisma.role.update({ where: { id }, data })
        return c.json({ code: 0, data: toRoleDetail(role), message: "ok" }, 200)
      } catch (err) {
        const message = p2002FieldMessage(err, ROLE_UNIQUE_FIELDS)
        if (message !== null) throw conflict(message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/roles/{id}",
      middleware: [authenticate(jwtSecret), requirePermission("system:role:delete")],
      request: { params: idParam },
      responses: {
        200: { description: "删除成功", ...okBody(z.null()) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "角色不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      // 存在性检查只需主键（select id）；UserRole/RoleMenu 由 Prisma 级联清理
      const target = await prisma.role.findUnique({ where: { id }, select: { id: true } })
      if (!target) throw notFound("角色不存在")
      await prisma.role.delete({ where: { id } })
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/roles/{id}/menus",
      middleware: [authenticate(jwtSecret), requirePermission("system:role:query")],
      request: { params: idParam },
      responses: {
        200: { description: "已授权菜单 id 数组（树形勾选回显，含按钮节点）", ...okBody(menuIdsSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "角色不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const role = await prisma.role.findUnique({ where: { id }, select: { id: true } })
      if (!role) throw notFound("角色不存在")
      const rows = await prisma.roleMenu.findMany({ where: { roleId: id }, select: { menuId: true } })
      return c.json({ code: 0, data: { menuIds: rows.map((r) => r.menuId) }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/roles/{id}/menus",
      middleware: [authenticate(jwtSecret), requirePermission("system:role:assign")],
      request: { params: idParam, body: { content: { "application/json": { schema: menuIdsSchema } } } },
      responses: {
        200: { description: "授权成功（全量替换，允许含按钮节点）", ...okBody(z.null()) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "角色不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const { menuIds } = c.req.valid("json")
      await fetchRoleDetail(id)
      // 统一交互式事务风格：校验（tx.menu.count，resolveMenuIds 模式）+ 全量替换同一事务内
      await prisma.$transaction(async (tx) => {
        const menus = await resolveMenuIds(tx, menuIds)
        await tx.roleMenu.deleteMany({ where: { roleId: id } })
        if (menus.length > 0) {
          await tx.roleMenu.createMany({ data: menus.map((menuId) => ({ roleId: id, menuId })) })
        }
      })
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  return app
}
