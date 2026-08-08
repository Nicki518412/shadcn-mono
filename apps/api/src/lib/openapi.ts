import { OpenAPIHono, z } from "@hono/zod-openapi"
import type { Env } from "hono"
import { validationHook } from "./validation-hook.js"

/** 受保护端点统一引用的 HTTP Bearer 安全要求（JWT 与 Clerk session token 均走 Authorization: Bearer）。 */
export const bearerSecurity = [{ BearerAuth: [] as string[] }]

/** 统一成功响应 content 包装（契约体 { code, data, message }，data 随路由不同）；auth/otp 路由共用 */
export function okBody(dataSchema: z.ZodType): { content: { "application/json": { schema: z.ZodType } } } {
  // z.null() 默认序列化为 {nullable:true}（OAS 3.0 无 null 类型）→ openapi-typescript 生成 unknown；
  // enum:[null] 是 OAS 3.0 合法的 null 表达 → 生成 null（与 ErrorBody.data 同型，Task 14 实证）
  if (dataSchema instanceof z.ZodNull) {
    dataSchema = dataSchema.openapi({ enum: [null] })
  }
  return {
    content: {
      "application/json": { schema: z.object({ code: z.number(), data: dataSchema, message: z.string() }) },
    },
  }
}

/** 子应用工厂：统一 defaultHook（子应用不继承根应用 defaultHook，校验失败契约体保持一致）；auth/otp 路由共用 */
export function createSubApp(): OpenAPIHono {
  return new OpenAPIHono<Env>({ defaultHook: validationHook })
}
