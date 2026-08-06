import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { NavigateFunction } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import ErrorBoundary from "../src/components/business/ErrorBoundary"
import ForbiddenPage from "../src/pages/ForbiddenPage"
import NotFoundPage from "../src/pages/NotFoundPage"

const { navigate } = vi.hoisted(() => ({
  navigate: vi.fn<NavigateFunction>(),
}))

vi.mock("react-router", () => ({
  useNavigate: () => navigate,
}))

afterEach(() => {
  cleanup()
  navigate.mockClear()
})

describe("NotFoundPage", () => {
  it("渲染 404 文案，返回首页按钮跳转 /", () => {
    render(<NotFoundPage />)

    expect(screen.getByText("404")).toBeInTheDocument()
    expect(screen.getByText("页面不存在")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "返回首页" }))
    expect(navigate).toHaveBeenCalledWith("/")
  })
})

describe("ForbiddenPage", () => {
  it("渲染 403 文案，返回首页按钮跳转 /", () => {
    render(<ForbiddenPage />)

    expect(screen.getByText("403")).toBeInTheDocument()
    expect(screen.getByText("无权限访问该页面")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "返回首页" }))
    expect(navigate).toHaveBeenCalledWith("/")
  })
})

describe("ErrorBoundary", () => {
  // 抛错用例会静音 console.error 并替换 window.location——若断言失败泄漏到后续用例难以排查，
  // 统一在 afterEach 恢复（originalLocation 在用例执行前捕获）
  const originalLocation = window.location
  let consoleError: ReturnType<typeof vi.spyOn> | undefined

  afterEach(() => {
    consoleError?.mockRestore()
    consoleError = undefined
    Object.defineProperty(window, "location", {
      value: originalLocation,
      configurable: true,
      writable: true,
    })
  })

  function Bomb(): null {
    throw new Error("boom")
  }

  it("子组件正常：原样渲染 children", () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>,
    )

    expect(screen.getByText("正常内容")).toBeInTheDocument()
    expect(screen.queryByText("页面出错了")).not.toBeInTheDocument()
  })

  it("子组件渲染抛错：展示兜底而非白屏", () => {
    // React 会向 console.error 输出错误详情，静音以保持测试输出干净
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )

    expect(screen.getByText("页面出错了")).toBeInTheDocument()
    expect(screen.getByText("应用发生未知错误，请刷新后重试")).toBeInTheDocument()
  })

  it("点击刷新按钮：调用 window.location.reload", () => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const reload = vi.fn()
    Object.defineProperty(window, "location", {
      value: { reload },
      configurable: true,
      writable: true,
    })

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )

    fireEvent.click(screen.getByRole("button", { name: "刷新页面" }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
