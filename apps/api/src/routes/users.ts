import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import type { Prisma } from "@repo/db"
import { prisma } from "@repo/db"
import { badRequest, conflict, notFound } from "../lib/http-error.js"
import { createSubApp, okBody } from "../lib/openapi.js"
import { hashPassword } from "../lib/password.js"
import { errorBodySchema, userDetailSchema, userPageResultSchema } from "../lib/schemas.js"
import { authenticate, requirePermission } from "../middleware/auth.js"

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  keyword: z.string().optional(),
})

const userCreateSchema = z.object({
  username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(8).max(128),
  nickname: z.string().min(1).max(64),
  email: z.string().email().optional(),
  telephone: z.string().min(5).max(32).optional(),
  roleIds: z.array(z.string()).optional(),
})

// 全部字段可选（改谁传谁）；status 仅更新时可用
const userUpdateSchema = userCreateSchema.partial().extend({ status: z.boolean().optional() })

const roleIdsSchema = z.object({ roleIds: z.array(z.string()) })

const idParam = z.object({ id: z.string() })

/** P2002（唯一约束冲突）→ 字段级 409 message；非唯一冲突返回 null（SQLite/MySQL 错误消息格式不同，按包含匹配） */
function uniqueConflictMessage(err: unknown): string | null {
  if (typeof err !== "object" || err === null || (err as { code?: string }).code !== "P2002") return null
  const message = err instanceof Error ? err.message : ""
  if (message.includes("username")) return "用户名已存在"
  if (message.includes("email")) return "邮箱已被使用"
  if (message.includes("telephone")) return "手机号已被使用"
  return "数据冲突"
}

/** 角色存在性校验 + 去重（不存在 → 400）；返回去重后的 roleIds */
async function validateRoleIds(roleIds: string[]): Promise<string[]> {
  const unique = Array.from(new Set(roleIds))
  if (unique.length === 0) return unique
  const count = await prisma.role.count({ where: { id: { in: unique } } })
  if (count !== unique.length) throw badRequest("角色不存在")
  return unique
}

/** 用户详情（含已挂角色）；不存在 → 404 */
async function fetchUserDetail(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { roles: { include: { role: true } } },
  })
  if (!user) throw notFound("用户不存在")
  return user
}

type UserDetail = Awaited<ReturnType<typeof fetchUserDetail>>

function toUserDetail(user: UserDetail) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    telephone: user.telephone,
    status: user.status,
    createdAt: user.createdAt,
    roles: user.roles.map((r) => ({ id: r.role.id, name: r.role.name, code: r.role.code })),
  }
}

export function userRoutes(jwtSecret: string): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/users",
      middleware: [authenticate(jwtSecret), requirePermission("system:user:query")],
      request: { query: pageQuery },
      responses: {
        200: { description: "用户分页列表", ...okBody(userPageResultSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { page, pageSize, keyword } = c.req.valid("query")
      const where = keyword
        ? {
            OR: [
              { username: { contains: keyword } },
              { nickname: { contains: keyword } },
              { email: { contains: keyword } },
              { telephone: { contains: keyword } },
            ],
          }
        : {}
      const [list, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
          include: { roles: { include: { role: true } } },
        }),
        prisma.user.count({ where }),
      ])
      return c.json({ code: 0, data: { list: list.map(toUserDetail), total }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/users",
      middleware: [authenticate(jwtSecret), requirePermission("system:user:create")],
      request: { body: { content: { "application/json": { schema: userCreateSchema } } } },
      responses: {
        200: { description: "创建成功（返回详情）", ...okBody(userDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "用户名/邮箱/手机号已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { username, password, nickname, email, telephone, roleIds } = c.req.valid("json")
      const roles = roleIds ? await validateRoleIds(roleIds) : []
      const passwordHash = await hashPassword(password)
      const data: Prisma.UserCreateInput = { username: username.toLowerCase(), passwordHash, nickname }
      // exactOptionalPropertyTypes：undefined 不传；username/email 统一小写存储
      if (email) data.email = email.toLowerCase()
      if (telephone) data.telephone = telephone
      try {
        const user = await prisma.$transaction(async (tx) => {
          const created = await tx.user.create({ data })
          if (roles.length > 0) {
            await tx.userRole.createMany({ data: roles.map((roleId) => ({ userId: created.id, roleId })) })
          }
          return created
        })
        return c.json({ code: 0, data: toUserDetail(await fetchUserDetail(user.id)), message: "ok" }, 200)
      } catch (err) {
        const message = uniqueConflictMessage(err)
        if (message) throw conflict(message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/users/{id}",
      middleware: [authenticate(jwtSecret), requirePermission("system:user:query")],
      request: { params: idParam },
      responses: {
        200: { description: "用户详情（含已挂角色）", ...okBody(userDetailSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "用户不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      return c.json({ code: 0, data: toUserDetail(await fetchUserDetail(id)), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/users/{id}",
      middleware: [authenticate(jwtSecret), requirePermission("system:user:update")],
      request: { params: idParam, body: { content: { "application/json": { schema: userUpdateSchema } } } },
      responses: {
        200: { description: "更新成功（返回详情）", ...okBody(userDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "用户不存在", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "用户名/邮箱/手机号已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const { roleIds, password, ...fields } = c.req.valid("json")
      await fetchUserDetail(id)
      const data: Prisma.UserUpdateInput = {}
      if (fields.username !== undefined) data.username = fields.username.toLowerCase()
      if (fields.nickname !== undefined) data.nickname = fields.nickname
      if (fields.email !== undefined) data.email = fields.email.toLowerCase()
      if (fields.telephone !== undefined) data.telephone = fields.telephone
      if (fields.status !== undefined) data.status = fields.status
      if (password !== undefined) data.passwordHash = await hashPassword(password)
      try {
        if (roleIds !== undefined) {
          const roles = await validateRoleIds(roleIds)
          await prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id }, data })
            await tx.userRole.deleteMany({ where: { userId: id } })
            if (roles.length > 0) {
              await tx.userRole.createMany({ data: roles.map((roleId) => ({ userId: id, roleId })) })
            }
          })
        } else {
          await prisma.user.update({ where: { id }, data })
        }
        return c.json({ code: 0, data: toUserDetail(await fetchUserDetail(id)), message: "ok" }, 200)
      } catch (err) {
        const message = uniqueConflictMessage(err)
        if (message) throw conflict(message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/users/{id}",
      middleware: [authenticate(jwtSecret), requirePermission("system:user:delete")],
      request: { params: idParam },
      responses: {
        200: { description: "删除成功", ...okBody(z.null()) },
        400: { description: "不能删除自己", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "用户不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      await fetchUserDetail(id)
      if (id === c.get("userId")) throw badRequest("不能删除自己")
      await prisma.user.delete({ where: { id } })
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/users/{id}/roles",
      middleware: [authenticate(jwtSecret), requirePermission("system:user:assign-role")],
      request: { params: idParam, body: { content: { "application/json": { schema: roleIdsSchema } } } },
      responses: {
        200: { description: "分配成功（返回详情）", ...okBody(userDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "用户不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const { roleIds } = c.req.valid("json")
      await fetchUserDetail(id)
      const roles = await validateRoleIds(roleIds)
      await prisma.$transaction([
        prisma.userRole.deleteMany({ where: { userId: id } }),
        prisma.userRole.createMany({ data: roles.map((roleId) => ({ userId: id, roleId })) }),
      ])
      return c.json({ code: 0, data: toUserDetail(await fetchUserDetail(id)), message: "ok" }, 200)
    },
  )

  return app
}
