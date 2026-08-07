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
        {
          id: "m5",
          parentId: "m2",
          name: "角色管理",
          type: "MENU",
          path: "/system/role",
          component: "system/role",
          icon: null,
          permission: "system:role:query",
          sort: 2,
          status: true,
          children: [],
        },
      ],
    },
  ],
  // 权限码 2 个 vs MENU 节点 3 个：数值刻意不相等，断言可区分两项统计（若相等，互换后测试无法察觉）
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
    // 定义列表布局：标签（dt）与值（dd）分离，按 label/value 分别断言
    expect(screen.getByText("用户名")).toBeInTheDocument()
    expect(screen.getByText("admin")).toBeInTheDocument()
    expect(screen.getByText("邮箱")).toBeInTheDocument()
    expect(screen.getByText("admin@example.com")).toBeInTheDocument()
    expect(screen.getByText("手机号")).toBeInTheDocument()
    expect(screen.getByText("13800138000")).toBeInTheDocument()
  })

  it("角色以 Badge 展示角色名", () => {
    mockMe.mockReturnValue({ data: me })

    render(<DashboardPage />)

    expect(screen.getByText("管理员")).toBeInTheDocument()
  })

  it("权限统计：权限码数与导航菜单数（递归只计 MENU）", () => {
    mockMe.mockReturnValue({ data: me })

    render(<DashboardPage />)

    // 按 testid 绑定到具体统计项（不依赖样式 class）：permissionCodes 2 个 vs MENU 3 个（Dashboard+用户管理+角色管理，BUTTON 不计）
    expect(screen.getByTestId("stat-permission-count")).toHaveTextContent("2")
    expect(screen.getByTestId("stat-menu-count")).toHaveTextContent("3")
  })

  it("me 为 null：优雅降级（?? 兜底，不报错）", () => {
    mockMe.mockReturnValue({ data: null })

    render(<DashboardPage />)

    expect(screen.getByText("欢迎回来，…")).toBeInTheDocument()
    expect(screen.getAllByText("—")).toHaveLength(3)
    expect(screen.getByText("未分配角色")).toBeInTheDocument()
    expect(screen.getByTestId("stat-permission-count")).toHaveTextContent("0")
    expect(screen.getByTestId("stat-menu-count")).toHaveTextContent("0")
  })
})
