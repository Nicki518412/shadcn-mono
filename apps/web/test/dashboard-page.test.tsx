import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import DashboardPage from "../src/features/dashboard/page"
import type { components } from "../src/api/schema"

type MeResponse = components["schemas"]["MeResponse"]

const { mockMe } = vi.hoisted(() => ({
  mockMe: vi.fn<() => { data: MeResponse | null }>(),
}))

// Dashboard 消费守卫共享的 me 查询，测试直接 mock 该查询的返回值
vi.mock("../src/router/guards", () => ({
  ME_QUERY_KEY: ["me"],
  useMeQuery: () => mockMe(),
}))

const me: MeResponse = {
  user: {
    id: "u1",
    username: "admin",
    nickname: "系统管理员",
    email: "admin@example.com",
    telephone: "13800138000",
  },
  roles: [{ id: "r1", name: "管理员", code: "ADMIN" }],
  navTree: [
    {
      id: "m1",
      parentId: null,
      name: "Dashboard",
      type: "MENU",
      path: "/",
      component: "dashboard",
      icon: null,
      permission: null,
      sort: 0,
      status: true,
      children: [],
    },
    {
      id: "m2",
      parentId: null,
      name: "系统管理",
      type: "DIR",
      path: null,
      component: null,
      icon: null,
      permission: null,
      sort: 100,
      status: true,
      children: [
        {
          id: "m3",
          parentId: "m2",
          name: "用户管理",
          type: "MENU",
          path: "/system/user",
          component: "system/user",
          icon: null,
          permission: "system:user:query",
          sort: 1,
          status: true,
          children: [
            {
              id: "m4",
              parentId: "m3",
              name: "用户新增",
              type: "BUTTON",
              path: null,
              component: null,
              icon: null,
              permission: "system:user:create",
              sort: 1,
              status: true,
              children: [],
            },
          ],
        },
      ],
    },
  ],
  permissionCodes: ["system:user:query", "system:user:create"],
}

afterEach(() => {
  cleanup()
  mockMe.mockReset()
})

describe("DashboardPage", () => {
  it("展示欢迎语与账号信息", () => {
    mockMe.mockReturnValue({ data: me })

    render(<DashboardPage />)

    expect(screen.getByText("欢迎回来，系统管理员")).toBeInTheDocument()
    expect(screen.getByText("用户名：admin")).toBeInTheDocument()
    expect(screen.getByText("邮箱：admin@example.com")).toBeInTheDocument()
    expect(screen.getByText("手机号：13800138000")).toBeInTheDocument()
  })

  it("角色以 Badge 展示角色名", () => {
    mockMe.mockReturnValue({ data: me })

    render(<DashboardPage />)

    expect(screen.getByText("管理员")).toBeInTheDocument()
  })

  it("权限统计：权限码数与导航菜单数（递归只计 MENU）", () => {
    mockMe.mockReturnValue({ data: me })

    render(<DashboardPage />)

    expect(screen.getByText("按钮权限码")).toBeInTheDocument()
    expect(screen.getByText("导航菜单")).toBeInTheDocument()
    // permissionCodes 2 个；navTree 内 MENU 节点 2 个（Dashboard + 用户管理，BUTTON 不计）
    expect(screen.getAllByText("2", { selector: ".text-2xl" })).toHaveLength(2)
  })

  it("me 为 null：优雅降级（?? 兜底，不报错）", () => {
    mockMe.mockReturnValue({ data: null })

    render(<DashboardPage />)

    expect(screen.getByText("欢迎回来，…")).toBeInTheDocument()
    expect(screen.getByText("用户名：—")).toBeInTheDocument()
    expect(screen.getByText("未分配角色")).toBeInTheDocument()
    expect(screen.getAllByText("0", { selector: ".text-2xl" })).toHaveLength(2)
  })
})
