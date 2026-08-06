import { OpenAPIHono, z } from "@hono/zod-openapi"
import type { Env } from "hono"
import { validationHook } from "./validation-hook.js"

/** 统一成功响应 content 包装（契约体 { code, data, message }，data 随路由不同）；auth/otp 路由共用 */
export function okBody(dataSchema: z.ZodType): { content: { "application/json": { schema: z.ZodType } } } {
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
