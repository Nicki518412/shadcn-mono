import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import type { Prisma } from "@repo/db"
import { prisma } from "@repo/db"
import { badRequest, conflict, notFound } from "../lib/http-error.js"
import { createSubApp, okBody } from "../lib/openapi.js"
import { hashPassword } from "@repo/db"
import { p2002FieldMessage } from "../lib/prisma-error.js"
import { errorBodySchema, idParamSchema, userDetailSchema, userPageResultSchema } from "../lib/schemas.js"
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

// 全部字段可选（改谁传谁）；status 仅更新时可用；email/telephone 显式传 null 表示清空（undefined 不修改）
const userUpdateSchema = userCreateSchema
  .partial()
  .extend({
    status: z.boolean().optional(),
    email: z.string().email().nullable().optional(),
    telephone: z.string().min(5).max(32).nullable().optional(),
  })

const roleIdsSchema = z.object({ roleIds: z.array(z.string()) })

/** P2002 字段 → 409 message 映射（create/PATCH 共用） */
const USER_UNIQUE_FIELDS = {
  username: "用户名已存在",
  email: "邮箱已被使用",
  telephone: "手机号已被使用",
} as const

/** 角色存在性校验 + 去重（不存在 → 400）；事务内调用，保证校验与写入原子（须在 $transaction 回调中使用 tx） */
async function resolveRoleIds(tx: Prisma.TransactionClient, roleIds: string[]): Promise<string[]> {
  const unique = Array.from(new Set(roleIds))
  if (unique.length === 0) return unique
  const count = await tx.role.count({ where: { id: { in: unique } } })
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
      // keyword contains 三方言决策：SQLite/MySQL 转 LIKE（ASCII 大小写不敏感），PG 下大小写敏感
      // （Prisma mode:insensitive 仅 PG 可用）；LIKE 通配符 %/_ 不转义——管理端模糊搜索接受此行为，不做额外归一
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
      const passwordHash = await hashPassword(password)
      const data: Prisma.UserCreateInput = { username: username.toLowerCase(), passwordHash, nickname }
      // exactOptionalPropertyTypes：undefined 不传；username/email 统一小写存储
      if (email) data.email = email.toLowerCase()
      if (telephone) data.telephone = telephone
      try {
        const user = await prisma.$transaction(async (tx) => {
          const roles = roleIds ? await resolveRoleIds(tx, roleIds) : []
          const created = await tx.user.create({ data })
          if (roles.length > 0) {
            await tx.userRole.createMany({ data: roles.map((roleId) => ({ userId: created.id, roleId })) })
          }
          return created
        })
        return c.json({ code: 0, data: toUserDetail(await fetchUserDetail(user.id)), message: "ok" }, 200)
      } catch (err) {
        const message = p2002FieldMessage(err, USER_UNIQUE_FIELDS)
        if (message !== null) throw conflict(message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/users/{id}",
      middleware: [authenticate(jwtSecret), requirePermission("system:user:query")],
      request: { params: idParamSchema },
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
      request: { params: idParamSchema, body: { content: { "application/json": { schema: userUpdateSchema } } } },
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
      // exactOptionalPropertyTypes 分派：undefined 不修改、null 显式清空、string 小写写入
      if (fields.email !== undefined) data.email = fields.email === null ? null : fields.email.toLowerCase()
      if (fields.telephone !== undefined) data.telephone = fields.telephone
      if (fields.status !== undefined) data.status = fields.status
      if (password !== undefined) data.passwordHash = await hashPassword(password)
      try {
        if (roleIds !== undefined) {
          await prisma.$transaction(async (tx) => {
            const roles = await resolveRoleIds(tx, roleIds)
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
        const message = p2002FieldMessage(err, USER_UNIQUE_FIELDS)
        if (message !== null) throw conflict(message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/users/{id}",
      middleware: [authenticate(jwtSecret), requirePermission("system:user:delete")],
      request: { params: idParamSchema },
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
      // 存在性检查只需主键（select id），不需要 roles include
      const target = await prisma.user.findUnique({ where: { id }, select: { id: true } })
      if (!target) throw notFound("用户不存在")
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
      request: { params: idParamSchema, body: { content: { "application/json": { schema: roleIdsSchema } } } },
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
      // 统一交互式事务风格：校验（tx.role.count）+ 全量替换同一事务内
      await prisma.$transaction(async (tx) => {
        const roles = await resolveRoleIds(tx, roleIds)
        await tx.userRole.deleteMany({ where: { userId: id } })
        if (roles.length > 0) {
          await tx.userRole.createMany({ data: roles.map((roleId) => ({ userId: id, roleId })) })
        }
      })
      return c.json({ code: 0, data: toUserDetail(await fetchUserDetail(id)), message: "ok" }, 200)
    },
  )

  return app
}
