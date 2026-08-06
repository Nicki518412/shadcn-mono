import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { NavigateFunction } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AuthProviderView } from "../src/auth/AuthProvider"
import type { AuthProvider, AuthSession } from "../src/auth/types"
import LoginPage from "../src/pages/LoginPage"

const { navigate } = vi.hoisted(() => ({
  navigate: vi.fn<NavigateFunction>(),
}))

vi.mock("react-router", () => ({
  useNavigate: () => navigate,
}))

const session: AuthSession = {
  user: {
    id: "u1",
    username: "admin",
    nickname: "管理员",
    email: null,
    telephone: null,
  },
  accessToken: "at",
}

function createMockProvider(overrides: Partial<AuthProvider> = {}): AuthProvider {
  return {
    login: vi.fn<AuthProvider["login"]>().mockResolvedValue(session),
    sendOtp: vi.fn<AuthProvider["sendOtp"]>().mockResolvedValue(undefined),
    logout: vi.fn<AuthProvider["logout"]>(),
    refresh: vi.fn<AuthProvider["refresh"]>().mockResolvedValue(session),
    getSession: vi.fn<AuthProvider["getSession"]>().mockResolvedValue(session),
    ...overrides,
  }
}

function renderLoginPage(provider: AuthProvider) {
  return render(
    <AuthProviderView provider={provider}>
      <LoginPage />
    </AuthProviderView>,
  )
}

afterEach(() => {
  cleanup()
  navigate.mockClear()
  vi.useRealTimers()
})

describe("LoginPage", () => {
  it("渲染三个登录 Tab", () => {
    renderLoginPage(createMockProvider())

    expect(screen.getByRole("tab", { name: "账号密码" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "邮箱动态码" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "手机动态码" })).toBeInTheDocument()
  })

  it("动态码输入框可通过 label 关联访问", () => {
    // input-otp 内部 setTimeout 无法随组件卸载取消（上游行为），
    // 用 fake timers 确保其不会在环境销毁后触发
    vi.useFakeTimers()
    renderLoginPage(createMockProvider())

    fireEvent.click(screen.getByRole("tab", { name: "邮箱动态码" }))
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument()
    expect(screen.getByLabelText("动态码")).toBeInTheDocument()
  })

  it("账号密码登录：调用 auth.login 并跳转 /", async () => {
    const login = vi.fn<AuthProvider["login"]>().mockResolvedValue(session)
    renderLoginPage(createMockProvider({ login }))

    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "admin" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "Admin@123" } })
    fireEvent.click(screen.getByRole("button", { name: "登录" }))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        kind: "password",
        username: "admin",
        password: "Admin@123",
      })
      expect(navigate).toHaveBeenCalledWith("/")
    })
  })

  it("登录失败：展示后端错误消息且不跳转", async () => {
    const login = vi
      .fn<AuthProvider["login"]>()
      .mockRejectedValue(new Error("用户名或密码错误"))
    renderLoginPage(createMockProvider({ login }))

    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "admin" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "wrong!" } })
    fireEvent.click(screen.getByRole("button", { name: "登录" }))

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("用户名或密码错误")
    })
    expect(navigate).not.toHaveBeenCalled()
  })

  it("发送验证码：调用 auth.sendOtp 并进入 60s 冷却，冷却后恢复", async () => {
    vi.useFakeTimers()
    const sendOtp = vi.fn<AuthProvider["sendOtp"]>().mockResolvedValue(undefined)
    renderLoginPage(createMockProvider({ sendOtp }))

    fireEvent.click(screen.getByRole("tab", { name: "邮箱动态码" }))
    fireEvent.change(screen.getByPlaceholderText("name@example.com"), {
      target: { value: "admin@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送验证码" }))

    await act(() => Promise.resolve())

    expect(sendOtp).toHaveBeenCalledWith("email", "admin@example.com")
    const resendButton = screen.getByRole("button", { name: /重新发送/ })
    expect(resendButton).toBeDisabled()
    expect(resendButton).toHaveTextContent(/60s/)

    act(() => {
      vi.advanceTimersByTime(61_000)
    })

    expect(screen.getByRole("button", { name: "发送验证码" })).toBeEnabled()
  })

  it("发送中：按钮显示发送中并禁用，成功后进入冷却", async () => {
    vi.useFakeTimers()
    let resolveSend!: () => void
    const sendOtp = vi.fn<AuthProvider["sendOtp"]>().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve
        }),
    )
    renderLoginPage(createMockProvider({ sendOtp }))

    fireEvent.click(screen.getByRole("tab", { name: "邮箱动态码" }))
    fireEvent.change(screen.getByPlaceholderText("name@example.com"), {
      target: { value: "admin@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送验证码" }))

    const sendingButton = screen.getByRole("button", { name: /发送中/ })
    expect(sendingButton).toBeDisabled()

    act(() => {
      resolveSend()
    })
    await act(() => Promise.resolve())

    expect(sendOtp).toHaveBeenCalledWith("email", "admin@example.com")
    expect(screen.getByRole("button", { name: /重新发送/ })).toBeDisabled()
  })

  it("发送验证码失败：展示错误消息且不进入冷却", async () => {
    vi.useFakeTimers()
    const sendOtp = vi
      .fn<AuthProvider["sendOtp"]>()
      .mockRejectedValue(new Error("发送过于频繁，请稍后再试"))
    renderLoginPage(createMockProvider({ sendOtp }))

    fireEvent.click(screen.getByRole("tab", { name: "邮箱动态码" }))
    fireEvent.change(screen.getByPlaceholderText("name@example.com"), {
      target: { value: "admin@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送验证码" }))

    await act(() => Promise.resolve())

    expect(screen.getByRole("alert")).toHaveTextContent("发送过于频繁，请稍后再试")
    expect(screen.getByRole("button", { name: "发送验证码" })).toBeEnabled()
  })

  it("发送验证码目标为空：提示且不调用 auth.sendOtp", () => {
    vi.useFakeTimers()
    const sendOtp = vi.fn<AuthProvider["sendOtp"]>()
    renderLoginPage(createMockProvider({ sendOtp }))

    fireEvent.click(screen.getByRole("tab", { name: "邮箱动态码" }))
    fireEvent.click(screen.getByRole("button", { name: "发送验证码" }))

    expect(screen.getByRole("alert")).toHaveTextContent("请输入邮箱地址")
    expect(sendOtp).not.toHaveBeenCalled()
  })
})
