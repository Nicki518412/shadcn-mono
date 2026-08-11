import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@repo/db"
import { hashPassword } from "@repo/db"
import { createApp } from "../src/index.js"
import { loadConfig } from "../src/config.js"

const USERNAME = "file_admin"
const PASSWORD = "Passw0rd!"

// 1x1 红色 PNG 的字节（真实可解码图片，非任意字节）
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

let uploadDir: string
let app: ReturnType<typeof createApp>
let token: string

function fileForm(file: File): FormData {
  const form = new FormData()
  form.append("file", file)
  return form
}

describe("文件上传与访问", () => {
  beforeAll(async () => {
    // 隔离上传目录（默认 uploads 会被测试污染）；app 与 token 全局复用（登录一次）
    uploadDir = await mkdtemp(path.join(tmpdir(), "upload-test-"))
    app = createApp({ ...loadConfig(), uploadDir })
    await prisma.user.create({
      data: { username: USERNAME, passwordHash: await hashPassword(PASSWORD), nickname: "文件测试" },
    })
    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    })
    if (login.status !== 200) throw new Error(`登录失败: ${String(login.status)}`)
    token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken
  })

  afterAll(async () => {
    await rm(uploadDir, { recursive: true, force: true })
  })

  it("上传 png：返回 uuid 文件名/大小/类型，文件真实落盘", async () => {
    const res = await app.request("/api/files", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fileForm(new File([new Uint8Array(PNG_BYTES)], "avatar.png", { type: "image/png" })),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { filename: string; size: number; mimeType: string } }
    expect(body.data.filename).toMatch(/^[0-9a-f-]{36}\.png$/)
    expect(body.data.size).toBe(PNG_BYTES.length)
    expect(body.data.mimeType).toBe("image/png")
    // 文件已落盘且内容一致
    const stored = await readFile(path.join(uploadDir, body.data.filename))
    expect(stored.equals(PNG_BYTES)).toBe(true)
  })

  it("拒绝非图片类型（text/plain）与超 2MB 文件", async () => {
    const badType = await app.request("/api/files", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fileForm(new File(["hello"], "a.txt", { type: "text/plain" })),
    })
    expect(badType.status).toBe(400)
    expect(((await badType.json()) as { message: string }).message).toContain("图片")
    const oversized = await app.request("/api/files", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fileForm(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", { type: "image/png" })),
    })
    expect(oversized.status).toBe(400)
    expect(((await oversized.json()) as { message: string }).message).toContain("2MB")
  })

  it("GET 文件：鉴权后返回内容与 content-type；未登录 401", async () => {
    const upload = await app.request("/api/files", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fileForm(new File([new Uint8Array(PNG_BYTES)], "avatar.png", { type: "image/png" })),
    })
    const { filename } = ((await upload.json()) as { data: { filename: string } }).data
    const res = await app.request(`/api/files/${filename}`, { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("image/png")
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(Buffer.from(bytes).equals(PNG_BYTES)).toBe(true)
    // 未登录 401
    expect((await app.request(`/api/files/${filename}`)).status).toBe(401)
  })

  it("GET：不存在的文件 404；非法文件名 400（路径穿越白名单）", async () => {
    const missing = await app.request("/api/files/00000000-0000-0000-0000-000000000000.png", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(missing.status).toBe(404)
    const traversal = await app.request("/api/files/..%2F..%2Fsecret.txt", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(traversal.status).toBe(400)
    const badName = await app.request("/api/files/evil.txt", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(badName.status).toBe(400)
  })

  it("me avatar 链路：上传后 PATCH /users/me 保存 → me 返回 avatar；非法文件名 400；null 清空", async () => {
    const upload = await app.request("/api/files", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fileForm(new File([new Uint8Array(PNG_BYTES)], "avatar.png", { type: "image/png" })),
    })
    const { filename } = ((await upload.json()) as { data: { filename: string } }).data
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` }

    const save = await app.request("/api/users/me", {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ avatar: filename }),
    })
    expect(save.status).toBe(200)
    expect(((await save.json()) as { data: { avatar: string } }).data.avatar).toBe(filename)

    const me = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    })
    expect(((await me.json()) as { data: { user: { avatar: string } } }).data.user.avatar).toBe(filename)

    // 非法文件名（非 uuid 格式）400
    const badAvatar = await app.request("/api/users/me", {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ avatar: "../../evil" }),
    })
    expect(badAvatar.status).toBe(400)

    // null 清空
    const clear = await app.request("/api/users/me", {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ avatar: null }),
    })
    expect(clear.status).toBe(200)
    expect(((await clear.json()) as { data: { avatar: string | null } }).data.avatar).toBeNull()
  })
})
