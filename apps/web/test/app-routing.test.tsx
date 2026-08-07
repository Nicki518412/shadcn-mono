import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { App } from "../src/main"

/**
 * 根路由表集成测试：main.tsx 的路由结构（/login 直接渲染、其他路径走 RequireAuth 守卫）。
 * 回归场景：曾经缺失顶层 * catch-all，访问 / 时 React Router 无匹配 → 白屏
 * （jsdom 组件测试测不到——这是真实浏览器白屏 bug 的防线）。
 */
describe("app routing", () => {
  beforeEach(() => {
    // 无会话：/auth/me 401 + refresh 无 token 失败 → RequireAuth 重定向 /login
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 401, message: "未登录", data: null }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    ))
    localStorage.clear()
  })

  afterEach(() => {
    // 未开启 vitest globals——@testing-library 不自动卸载，必须显式 cleanup 防渲染污染
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("访问 /（未登录）→ 守卫重定向，最终渲染登录页", async () => {
    window.history.pushState({}, "", "/")
    render(<App />)
    expect(await screen.findByText("管理后台登录")).toBeInTheDocument()
  })

  it("访问 /login 直接渲染登录页（不经守卫）", async () => {
    window.history.pushState({}, "", "/login")
    render(<App />)
    expect(await screen.findByText("管理后台登录")).toBeInTheDocument()
  })

  it("访问未知路径（未登录）→ 守卫重定向登录页", async () => {
    window.history.pushState({}, "", "/no/such/page")
    render(<App />)
    expect(await screen.findByText("管理后台登录")).toBeInTheDocument()
  })
})
