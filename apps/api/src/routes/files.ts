import { mkdir, readFile, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { badRequest, notFound } from "../lib/http-error.js"
import type { AppConfig } from "../config.js"
import { bearerSecurity, createSubApp, okBody } from "../lib/openapi.js"
import { errorBodySchema, fileDetailSchema } from "../lib/schemas.js"
import { authenticate } from "../middleware/auth.js"

/** 允许的图片类型 → 扩展名（白名单；其他类型拒绝） */
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

/** 上传大小上限（2MB，头像场景足够） */
const MAX_FILE_SIZE = 2 * 1024 * 1024

/** 扩展名 → Content-Type（GET 响应用） */
const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
}

/** 文件名白名单（服务端生成，格式 uuid.ext） */
const FILENAME_PATTERN = /^[a-zA-Z0-9-]+\.(jpg|png|webp|gif)$/

/**
 * 文件上传/访问路由（图片白名单）：
 * - POST /api/files：登录用户上传（multipart），存本地磁盘（AppConfig.uploadDir），返回文件名
 * - GET /api/files/{filename}：鉴权访问（图片等二进制响应，非 JSON 契约体）
 * 文件名由服务端生成（uuid + 白名单扩展名），杜绝路径穿越/重名/危险扩展名。
 */
export function fileRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/files",
      middleware: [authenticate(cfg)],
      security: bearerSecurity,
      request: {
        body: {
          content: {
            "multipart/form-data": {
              schema: z.object({ file: z.any().openapi({ type: "string", format: "binary" }) }),
            },
          },
        },
      },
      responses: {
        200: { description: "上传成功（返回文件名，访问路径 /api/files/{filename}）", ...okBody(fileDetailSchema) },
        400: { description: "非图片类型/超大小", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const body = await c.req.parseBody()
      const file = body.file
      if (!(file instanceof File)) throw badRequest("请上传文件")
      if (file.size > MAX_FILE_SIZE) throw badRequest("文件大小不能超过 2MB")
      const ext = ALLOWED_TYPES[file.type]
      if (!ext) throw badRequest("仅支持 jpg/png/webp/gif 图片")
      const filename = `${randomUUID()}.${ext}`
      await mkdir(cfg.uploadDir, { recursive: true })
      await writeFile(path.join(cfg.uploadDir, filename), Buffer.from(await file.arrayBuffer()))
      return c.json({ code: 0, data: { filename, size: file.size, mimeType: file.type }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/files/{filename}",
      middleware: [authenticate(cfg)],
      security: bearerSecurity,
      request: { params: z.object({ filename: z.string() }) },
      responses: {
        200: {
          description: "文件内容（图片）",
          content: { "image/*": { schema: z.any() } },
        },
        400: { description: "文件名不合法", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "文件不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { filename } = c.req.valid("param")
      // 白名单校验（uuid.ext 格式），配合下方 join 前缀检查双保险防路径穿越
      if (!FILENAME_PATTERN.test(filename)) throw badRequest("文件名不合法")
      const filePath = path.join(cfg.uploadDir, filename)
      if (!filePath.startsWith(path.resolve(cfg.uploadDir) + path.sep)) throw badRequest("文件名不合法")
      const data = await readFile(filePath).catch(() => null)
      if (data === null) throw notFound("文件不存在")
      const ext = path.extname(filePath).slice(1)
      return c.body(data, 200, {
        "content-type": EXT_MIME[ext] ?? "application/octet-stream",
        "cache-control": "private, max-age=3600",
      })
    },
  )

  return app
}
