import { z } from "@hono/zod-openapi"
import type { User } from "@repo/db"
import type { MenuNode } from "@repo/shared"

/** OpenAPI 文档 info（index.ts app.doc 与 scripts/generate-openapi.ts 共用；version 与接口版本联动） */
export const API_INFO = { title: "shadcn-mono API", version: "0.1.0" } as const

// 注：zod-to-openapi v7 的 refId 走位置参数 openapi("RefId")（v6 的 { refId } 对象形式已不再支持）
/** 公开用户信息（登录/me 等响应共用，Task 14 openapi-typescript 生成类型） */
export const publicUserSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    nickname: z.string(),
    email: z.string().nullable(),
    telephone: z.string().nullable(),
  })
  .openapi("UserPublic")

/** 双 token 对（登录/刷新响应共用） */
export const tokenPairSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
  })
  .openapi("TokenPair")

/** 统一错误体（全部错误响应共享组件） */
export const errorBodySchema = z
  .object({
    code: z.string(),
    message: z.string(),
    // z.null() 默认序列化为 {nullable:true}（OAS 3.0 无 null 类型）→ openapi-typescript 生成 unknown；
    // enum:[null] 是 OAS 3.0 合法的 null 表达 → 生成精确的 null 类型（实证见 Task 14 实验）
    data: z.null().openapi({ enum: [null] }),
  })
  .openapi("ErrorBody")

/** 菜单类型校验收窄（Prisma Menu.type 为 string → MenuType；auth-info 与 menus 路由共用，禁止裸 as；脏数据抛 ZodError → onError 500） */
export const menuTypeSchema = z.enum(["DIR", "MENU", "BUTTON"])

/** {id} 路径参数（users/roles/menus 路由共用） */
export const idParamSchema = z.object({ id: z.string() })

/** 登录响应 data（tokenPair + user） */
export const loginResponseSchema = tokenPairSchema.extend({ user: publicUserSchema }).openapi("LoginResponse")

export type PublicUser = z.infer<typeof publicUserSchema>
export type TokenPair = z.infer<typeof tokenPairSchema>

/** 选 Prisma User 子集（字段均为非可选，避免 exactOptionalPropertyTypes 下 undefined 不可赋问题） */
export function toPublicUser(user: Pick<User, "id" | "username" | "nickname" | "email" | "telephone">): PublicUser {
  return { id: user.id, username: user.username, nickname: user.nickname, email: user.email, telephone: user.telephone }
}

/**
 * 递归 MenuNode schema（运行时校验 + 类型推断；schemas.test.ts 以真实 me 响应实测）。
 * 实证：zod-to-openapi v7（7.3.4）不支持 z.lazy —— 文档生成时抛 UnknownZodTypeError（typeName: ZodLazy）。
 * openapi.json 中的 MenuNode 组件由 index.ts 手工注册（见 createApp），me 响应用 menuNodeRefSchema 以 $ref 引用。
 */
export const menuNodeSchema: z.ZodType<MenuNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    parentId: z.string().nullable(),
    nameZh: z.string(),
    nameEn: z.string().nullable(),
    type: z.enum(["DIR", "MENU", "BUTTON"]),
    path: z.string().nullable(),
    component: z.string().nullable(),
    icon: z.string().nullable(),
    permission: z.string().nullable(),
    sort: z.number(),
    status: z.boolean(),
    children: z.array(menuNodeSchema),
  }),
)

/**
 * MenuNode 引用 schema（类型保持 MenuNode；文档中渲染为 $ref → 手工注册的 MenuNode 组件）。
 * 不能用 refId（z.any().openapi("MenuNode")）：v7 的 generateComponents 会把 schemaRefs 合并覆盖同名组件（实证：MenuNode 被污染为 {"nullable":true}）。
 * metadata.$ref 无 refId 不进 schemaRefs；类型层面 zod-openapi 的 metadata 类型不含 $ref 键，故 as never 绕过（运行时仅附加 $ref 键）。
 * 响应使用方：me navTree、menus 路由（tree/详情/create/update 复用同一组件）。
 */
export const menuNodeRefSchema: z.ZodType<MenuNode> = z.any().openapi({ $ref: "#/components/schemas/MenuNode" } as never)

/** me 响应：user + roles + 交集 navTree + permissionCodes */
export const meResponseSchema = z
  .object({
    user: publicUserSchema,
    roles: z.array(z.object({ id: z.string(), nameZh: z.string(), nameEn: z.string().nullable(), code: z.string() })),
    navTree: z.array(menuNodeRefSchema),
    permissionCodes: z.array(z.string()),
  })
  .openapi("MeResponse")

/** 用户-角色简要信息（用户列表/详情响应共用） */
export const userRoleSchema = z
  .object({ id: z.string(), nameZh: z.string(), nameEn: z.string().nullable(), code: z.string() })
  .openapi("UserRole")

/** 用户列表项（分页列表 data.list 元素） */
export const userListItemSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    nickname: z.string(),
    email: z.string().nullable(),
    telephone: z.string().nullable(),
    status: z.boolean(),
    createdAt: z.string(),
    roles: z.array(userRoleSchema),
  })
  .openapi("UserListItem")

/** 用户详情（含已挂角色；结构同列表项） */
// v7 下对同一 schema 重复 .openapi 会覆盖 refId 元数据 → extend({}) 派生新实例再命名，保留 UserListItem/UserDetail 两个组件
export const userDetailSchema = userListItemSchema.extend({}).openapi("UserDetail")

/** 用户分页结果 */
export const userPageResultSchema = z
  .object({ list: z.array(userListItemSchema), total: z.number() })
  .openapi("UserPageResult")

/** 角色列表项（分页列表 data.list 元素 / 全量列表共用） */
export const roleListItemSchema = z
  .object({
    id: z.string(),
    nameZh: z.string(),
    nameEn: z.string().nullable(),
    code: z.string(),
    description: z.string().nullable(),
    sort: z.number(),
    status: z.boolean(),
    createdAt: z.string(),
  })
  .openapi("RoleListItem")

/** 角色详情（结构同列表项） */
export const roleDetailSchema = roleListItemSchema.extend({}).openapi("RoleDetail")

/** 角色分页结果 */
export const rolePageResultSchema = z
  .object({ list: z.array(roleListItemSchema), total: z.number() })
  .openapi("RolePageResult")

/** 登录日志列表项（分页列表 data.list 元素；不含 userId 等内部字段） */
export const loginLogItemSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    status: z.string(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    message: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("LoginLogItem")

/** 登录日志分页结果 */
export const loginLogPageResultSchema = z
  .object({ list: z.array(loginLogItemSchema), total: z.number() })
  .openapi("LoginLogPageResult")

/** 操作日志列表项（分页列表 data.list 元素；不含 userId/userAgent/errorMessage 等内部字段） */
export const operationLogItemSchema = z
  .object({
    id: z.string(),
    username: z.string().nullable(),
    method: z.string(),
    path: z.string(),
    statusCode: z.number(),
    durationMs: z.number(),
    ip: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("OperationLogItem")

/** 操作日志分页结果 */
export const operationLogPageResultSchema = z
  .object({ list: z.array(operationLogItemSchema), total: z.number() })
  .openapi("OperationLogPageResult")
