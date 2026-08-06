import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { components } from "../src/api/schema"
import { AuthProviderView } from "../src/auth/AuthProvider"
import type { AuthProvider } from "../src/auth/types"
import MenuPage from "../src/features/system/menu/page"
import { ME_QUERY_KEY } from "../src/router/guards"

type MenuNode = components["schemas"]["MenuNode"]

/**
 * 简化菜单树（贴合种子结构）：根 MENU（Dashboard）+ DIR → MENU → BUTTON 三层 +
 * 嵌套 DIR（验证 DIR 默认全展开）；d2 置禁用用于状态列断言。
 */
const menuTree: MenuNode[] = [
  {
    id: "m0", parentId: null, name: "工作台", type: "MENU", path: "/",
    component: "dashboard", icon: null, permission: null, sort: 0, status: true, children: [],
  },
  {
    id: "d1",
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
        id: "m1", parentId: "d1", name: "用户管理", type: "MENU", path: "/system/user",
        component: "system/user", icon: null, permission: "system:user:query", sort: 1, status: true,
        children: [
          { id: "b1", parentId: "m1", name: "用户新增", type: "BUTTON", path: null, component: null, icon: null, permission: "system:user:create", sort: 1, status: true, children: [] },
          { id: "b2", parentId: "m1", name: "用户编辑", type: "BUTTON", path: null, component: null, icon: null, permission: "system:user:update", sort: 2, status: true, children: [] },
        ],
      },
      {
        id: "d2",
        parentId: "d1",
        name: "系统监控",
        type: "DIR",
        path: null,
        component: null,
        icon: null,
        permission: null,
        sort: 2,
        status: false,
        children: [
          {
            id: "m2", parentId: "d2", name: "监控面板", type: "MENU", path: "/system/monitor",
            component: "system/monitor", icon: null, permission: "system:monitor:query",
            sort: 1, status: true,
            children: [
              { id: "b3", parentId: "m2", name: "监控导出", type: "BUTTON", path: null, component: null, icon: null, permission: "system:monitor:export", sort: 1, status: true, children: [] },
            ],
          },
        ],
      },
    ],
  },
]

const ALL_PERMISSIONS = [
  "system:menu:query",
  "system:menu:create",
  "system:menu:update",
  "system:menu:delete",
]

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, data, message: "ok" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

/** RequestInfo | URL → 字符串 URL（base-to-string 规则禁止 String(object)） */
function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

/**
 * 路由式 fetch mock：GET /api/menus/tree 全量树、POST/PATCH/DELETE 均返回成功；
 * 其余 URL 抛错防静默。
 */
function createFetchMock() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = toUrlString(input)
    const method = init?.method ?? "GET"
    if (method === "POST" && url === "/api/menus") {
      return Promise.resolve(okResponse(menuTree[0]))
    }
    if (method === "PATCH" && url.startsWith("/api/menus/")) {
      return Promise.resolve(okResponse(menuTree[0]))
    }
    if (method === "DELETE") {
      return Promise.resolve(okResponse(null))
    }
    if (url.startsWith("/api/menus/tree")) {
      return Promise.resolve(okResponse(menuTree))
    }
    throw new Error(`unexpected fetch: ${method} ${url}`)
  })
}

function createMockProvider(): AuthProvider {
  return {
    login: vi.fn(),
    sendOtp: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    getSession: vi.fn(),
  }
}

/**
 * 预填充 me 缓存（Permission 组件依赖）：permissionCodes 决定按钮渲染；
 * staleTime: Infinity 阻止 useMeQuery 后台 refetch 覆盖缓存（fetch mock 不含 /auth/me）
 */
function renderMenuPage(
  fetchMock: ReturnType<typeof createFetchMock>,
  permissionCodes: string[] = ALL_PERMISSIONS,
) {
  vi.stubGlobal("fetch", fetchMock)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData<components["schemas"]["MeResponse"]>(ME_QUERY_KEY, {
    user: { id: "u1", username: "admin", nickname: "系统管理员", email: null, telephone: null },
    roles: [{ id: "r1", name: "管理员", code: "ADMIN" }],
    navTree: [],
    permissionCodes,
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProviderView provider={createMockProvider()}>
        <MenuPage />
      </AuthProviderView>
    </QueryClientProvider>,
  )
}

/** 定位指定菜单名所在行的操作按钮 */
function rowButton(menuName: string, name: string): HTMLElement {
  const row = screen.getByText(menuName).closest("tr")
  if (!row) throw new Error(`找不到菜单行: ${menuName}`)
  return within(row).getByRole("button", { name })
}

/** 某 method 的所有请求体（已 JSON.parse） */
function fetchBodies(fetchMock: ReturnType<typeof createFetchMock>, method: string) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([, init]) => init?.body)
    .filter((body): body is string => typeof body === "string")
    .map((body) => JSON.parse(body) as Record<string, unknown>)
}

/** 某 method 的所有请求 URL */
function fetchUrls(fetchMock: ReturnType<typeof createFetchMock>, method: string) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([input]) => toUrlString(input))
}

/**
 * 选择 Base UI Select 选项：pointerDown + click。
 * SelectItem 的 commit 依赖 pointerdown 置位的 allowMouseSelection——纯 click
 * （detail=0、无 pointer 数据）只移动高亮不提交选择（源码 isVirtualClick 判定）。
 */
function clickOption(name: string): void {
  const option = screen.getByRole("option", { name })
  fireEvent.pointerDown(option)
  fireEvent.click(option)
}

/** 渲染页面并打开「新增菜单」Dialog（等树渲染后点新增按钮） */
async function openCreateDialog(
  fetchMock: ReturnType<typeof createFetchMock>,
): Promise<HTMLElement> {
  renderMenuPage(fetchMock)
  await waitFor(() => {
    expect(screen.getByText("系统管理")).toBeInTheDocument()
  })
  fireEvent.click(screen.getByRole("button", { name: "新增菜单" }))
  const dialog = await screen.findByRole("dialog")
  expect(dialog).toHaveTextContent("新增菜单")
  return dialog
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("MenuPage", () => {
  it("树表格渲染：DIR 默认展开、MENU 收起使 BUTTON 行默认不可见，展开 MENU 后可见", async () => {
    renderMenuPage(createFetchMock())

    await waitFor(() => {
      expect(screen.getByText("系统管理")).toBeInTheDocument()
    })
    // DIR（含嵌套 DIR）默认展开：DIR 与其下 MENU 行均可见
    expect(screen.getByText("用户管理")).toBeInTheDocument()
    expect(screen.getByText("系统监控")).toBeInTheDocument()
    expect(screen.getByText("监控面板")).toBeInTheDocument()
    // 根 MENU 行可见但收起（无按钮子行）
    expect(screen.getByText("工作台")).toBeInTheDocument()
    // BUTTON 行默认不可见（设计 §7：外层列表不显示 button）
    expect(screen.queryByText("用户新增")).not.toBeInTheDocument()
    expect(screen.queryByText("用户编辑")).not.toBeInTheDocument()
    expect(screen.queryByText("监控导出")).not.toBeInTheDocument()
    // 路径/组件/权限码/类型/状态列
    expect(screen.getByText("/system/user")).toBeInTheDocument()
    expect(screen.getByText("system/user")).toBeInTheDocument()
    expect(screen.getByText("system:user:query")).toBeInTheDocument()
    // 类型 Badge：可见 5 行 = 2 DIR（系统管理/系统监控）+ 3 MENU（工作台/用户管理/监控面板）
    expect(screen.getAllByText("DIR")).toHaveLength(2)
    expect(screen.getAllByText("MENU")).toHaveLength(3)
    expect(screen.getByText("禁用")).toBeInTheDocument()
    // 可见行数：工作台 + 系统管理 + 用户管理 + 系统监控 + 监控面板 = 5 行
    expect(screen.getAllByRole("button", { name: "编辑" })).toHaveLength(5)

    // 展开 MENU：BUTTON 子行可见；收起后再次隐藏
    fireEvent.click(screen.getByRole("button", { name: "展开用户管理" }))
    expect(screen.getByText("用户新增")).toBeInTheDocument()
    expect(screen.getByText("用户编辑")).toBeInTheDocument()
    expect(screen.getByText("system:user:create")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "编辑" })).toHaveLength(7)
    fireEvent.click(screen.getByRole("button", { name: "收起用户管理" }))
    expect(screen.queryByText("用户新增")).not.toBeInTheDocument()

    // 展开嵌套 MENU：BUTTON 子行可见
    fireEvent.click(screen.getByRole("button", { name: "展开监控面板" }))
    expect(screen.getByText("监控导出")).toBeInTheDocument()
  })

  it("无 system:menu:create 权限：不渲染新增按钮（其余操作按钮不受影响）", async () => {
    renderMenuPage(
      createFetchMock(),
      ALL_PERMISSIONS.filter((code) => code !== "system:menu:create"),
    )

    await waitFor(() => {
      expect(screen.getByText("系统管理")).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: "新增菜单" })).not.toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "编辑" })).toHaveLength(5)
    expect(screen.getAllByRole("button", { name: "删除" })).toHaveLength(5)
  })

  it("新增菜单：父节点选项按类型过滤（BUTTON 仅 MENU 父）→ 填表提交 POST body 断言", async () => {
    const fetchMock = createFetchMock()
    const dialog = await openCreateDialog(fetchMock)

    // 默认类型 DIR：父节点选项 = 无（根目录）+ 全部 DIR，不含 MENU
    fireEvent.click(within(dialog).getByLabelText("父节点"))
    expect(screen.getByRole("option", { name: "无（根目录）" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "系统管理" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "系统监控" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "用户管理" })).not.toBeInTheDocument()
    clickOption("系统管理")

    // 切到 MENU：父节点仍只能选 DIR（MENU/BUTTON 不可为父）
    fireEvent.click(within(dialog).getByLabelText("类型"))
    clickOption("MENU")
    fireEvent.click(within(dialog).getByLabelText("父节点"))
    expect(screen.getByRole("option", { name: "系统管理" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "用户管理" })).not.toBeInTheDocument()
    clickOption("系统管理")

    // 切到 BUTTON：父选项只余 MENU 节点，且不可为根
    fireEvent.click(within(dialog).getByLabelText("类型"))
    clickOption("BUTTON")
    fireEvent.click(within(dialog).getByLabelText("父节点"))
    expect(screen.getByRole("option", { name: "用户管理" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "监控面板" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "无（根目录）" })).not.toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "系统管理" })).not.toBeInTheDocument()
    clickOption("用户管理")

    // 切回 MENU：type 变更后原父节点（BUTTON 专用父 m1）非法 → 自动重置
    fireEvent.click(within(dialog).getByLabelText("类型"))
    clickOption("MENU")
    // 父 Select 已重置为空 → 显示「无（根目录）」占位
    expect(within(dialog).getByLabelText("父节点")).toHaveTextContent("无（根目录）")
    fireEvent.click(within(dialog).getByLabelText("父节点"))
    expect(screen.getByRole("option", { name: "系统管理" })).toBeInTheDocument()
    clickOption("系统管理")
    fireEvent.change(within(dialog).getByLabelText("菜单名称"), { target: { value: "订单管理" } })
    fireEvent.change(within(dialog).getByLabelText("路由路径"), { target: { value: "/system/order" } })
    fireEvent.change(within(dialog).getByLabelText("组件"), { target: { value: "system/order" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() => {
      expect(fetchBodies(fetchMock, "POST")).toContainEqual({
        name: "订单管理",
        type: "MENU",
        parentId: "d1",
        path: "/system/order",
        component: "system/order",
        icon: null,
        permission: null,
        sort: 0,
        status: true,
      })
    })
  })

  it("编辑菜单：字段回显 + 父选项排除自身子树 + 改 BUTTON 时 path/component 显式 null", async () => {
    const fetchMock = createFetchMock()
    renderMenuPage(fetchMock)

    await waitFor(() => {
      expect(screen.getByText("系统管理")).toBeInTheDocument()
    })
    fireEvent.click(rowButton("用户管理", "编辑"))

    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("编辑菜单")
    // 字段回显：名称/类型/路由/组件
    expect(within(dialog).getByLabelText("菜单名称")).toHaveValue("用户管理")
    expect(within(dialog).getByLabelText("类型")).toHaveTextContent("MENU")
    expect(within(dialog).getByLabelText("路由路径")).toHaveValue("/system/user")
    expect(within(dialog).getByLabelText("组件")).toHaveValue("system/user")

    // 排除自身子树：父选项只余 DIR 级节点，自身（用户管理）及后代（用户新增/用户编辑）不可选
    fireEvent.click(within(dialog).getByLabelText("父节点"))
    expect(screen.getByRole("option", { name: "无（根目录）" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "系统管理" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "系统监控" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "用户管理" })).not.toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "用户新增" })).not.toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "用户编辑" })).not.toBeInTheDocument()
    clickOption("系统管理")

    // MENU → BUTTON：path/component 显式传 null 清空（防后端"BUTTON 不允许填写 path 和 component"）；
    // 原父 d1（DIR）非法自动重置，需重选 MENU 父（监控面板）
    fireEvent.click(within(dialog).getByLabelText("类型"))
    clickOption("BUTTON")
    fireEvent.click(within(dialog).getByLabelText("父节点"))
    expect(screen.getByRole("option", { name: "监控面板" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "无（根目录）" })).not.toBeInTheDocument()
    clickOption("监控面板")
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() => {
      expect(fetchUrls(fetchMock, "PATCH")).toContain("/api/menus/m1")
      expect(fetchBodies(fetchMock, "PATCH")).toContainEqual({
        name: "用户管理",
        type: "BUTTON",
        parentId: "m2",
        path: null,
        component: null,
        icon: null,
        permission: "system:user:query",
        sort: 1,
        status: true,
      })
    })
  })

  it("删除菜单：AlertDialog 级联提示并调用 DELETE /api/menus/{id}", async () => {
    const fetchMock = createFetchMock()
    renderMenuPage(fetchMock)

    await waitFor(() => {
      expect(screen.getByText("系统管理")).toBeInTheDocument()
    })
    fireEvent.click(rowButton("系统管理", "删除"))

    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("确定删除菜单「系统管理」？")
    expect(dialog).toHaveTextContent("将删除该菜单及其全部子节点")
    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }))

    await waitFor(() => {
      expect(fetchUrls(fetchMock, "DELETE")).toContain("/api/menus/d1")
    })
  })
})
