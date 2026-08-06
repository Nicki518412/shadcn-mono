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
import RolePage from "../src/features/system/role/page"
import { ME_QUERY_KEY } from "../src/router/guards"

const roleList: components["schemas"]["RoleListItem"][] = [
  {
    id: "r1",
    name: "管理员",
    code: "ADMIN",
    description: "系统内置管理员",
    sort: 0,
    status: true,
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "r2",
    name: "访客",
    code: "GUEST",
    description: null,
    sort: 100,
    status: false,
    createdAt: "2026-08-02T00:00:00.000Z",
  },
]

/** 简化菜单树（贴合种子结构）：DIR(系统管理) → MENU(用户/角色管理) → BUTTON（无子级） */
const menuTree: components["schemas"]["MenuNode"][] = [
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
        id: "m1",
        parentId: "d1",
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
            id: "b1", parentId: "m1", name: "用户新增", type: "BUTTON", path: null,
            component: null, icon: null, permission: "system:user:create",
            sort: 1, status: true, children: [],
          },
          {
            id: "b2", parentId: "m1", name: "用户编辑", type: "BUTTON", path: null,
            component: null, icon: null, permission: "system:user:update",
            sort: 2, status: true, children: [],
          },
        ],
      },
      {
        id: "m2",
        parentId: "d1",
        name: "角色管理",
        type: "MENU",
        path: "/system/role",
        component: "system/role",
        icon: null,
        permission: "system:role:query",
        sort: 2,
        status: true,
        children: [
          {
            id: "b3", parentId: "m2", name: "分配权限", type: "BUTTON", path: null,
            component: null, icon: null, permission: "system:role:assign",
            sort: 1, status: true, children: [],
          },
        ],
      },
    ],
  },
]

const ALL_PERMISSIONS = [
  "system:role:query",
  "system:role:create",
  "system:role:update",
  "system:role:delete",
  "system:role:assign",
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
 * 路由式 fetch mock：GET /api/roles 分页列表、GET /api/roles/{id}/menus 回显（grantIds 可配）、
 * GET /api/menus/tree 全量树、POST/PATCH/PUT/DELETE 均返回成功；其余 URL 抛错防静默。
 */
function createFetchMock(options: { total?: number; grantIds?: string[]; pendingMenus?: boolean } = {}) {
  const grantIds = options.grantIds ?? []
  const total = options.total ?? roleList.length
  return vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = toUrlString(input)
    const method = init?.method ?? "GET"
    if (method === "POST" && url === "/api/roles") {
      return Promise.resolve(okResponse(roleList[0]))
    }
    if (method === "PATCH" && url.startsWith("/api/roles/")) {
      return Promise.resolve(okResponse(roleList[0]))
    }
    if (method === "PUT" && url.endsWith("/menus")) {
      return Promise.resolve(okResponse(null))
    }
    if (method === "DELETE") {
      return Promise.resolve(okResponse(null))
    }
    if (method === "GET" && url.includes("/api/roles/") && url.endsWith("/menus")) {
      // pendingMenus：回显查询永不 resolve，用于断言数据未就绪时保存按钮禁用
      return options.pendingMenus
        ? new Promise<Response>(() => undefined)
        : Promise.resolve(okResponse({ menuIds: grantIds }))
    }
    if (url.startsWith("/api/roles")) {
      return Promise.resolve(okResponse({ list: roleList, total }))
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
function renderRolePage(
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
        <RolePage />
      </AuthProviderView>
    </QueryClientProvider>,
  )
}

/** 定位指定角色名所在行的操作按钮 */
function rowButton(roleName: string, name: string): HTMLElement {
  const row = screen.getByText(roleName).closest("tr")
  if (!row) throw new Error(`找不到角色行: ${roleName}`)
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

/** 渲染页面并打开「分配权限」Dialog（等列表渲染后点行内按钮） */
async function openGrantDialog(
  fetchMock: ReturnType<typeof createFetchMock>,
  roleName = "管理员",
): Promise<void> {
  renderRolePage(fetchMock)
  await waitFor(() => {
    expect(screen.getByText(roleName)).toBeInTheDocument()
  })
  fireEvent.click(rowButton(roleName, "分配权限"))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("RolePage", () => {
  it("渲染角色列表：名称/编码/状态/描述 + 权限门控操作按钮", async () => {
    renderRolePage(createFetchMock())

    await waitFor(() => {
      expect(screen.getByText("管理员")).toBeInTheDocument()
    })
    expect(screen.getByText("访客")).toBeInTheDocument()
    expect(screen.getByText("ADMIN")).toBeInTheDocument()
    expect(screen.getByText("GUEST")).toBeInTheDocument()
    expect(screen.getByText("系统内置管理员")).toBeInTheDocument()
    expect(screen.getByText("启用")).toBeInTheDocument()
    expect(screen.getByText("禁用")).toBeInTheDocument()
    // 空描述渲染占位符；排序列展示数字
    expect(screen.getAllByText("-")).toHaveLength(1)
    expect(screen.getByText("0")).toBeInTheDocument()
    // Permission 全量授权：新增/分配权限/编辑/删除按钮均渲染
    expect(screen.getByRole("button", { name: "新增角色" })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "分配权限" })).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: "编辑" })).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: "删除" })).toHaveLength(2)
  })

  it("无 system:role:assign 权限：不渲染分配权限按钮（其余操作按钮不受影响）", async () => {
    renderRolePage(
      createFetchMock(),
      ALL_PERMISSIONS.filter((code) => code !== "system:role:assign"),
    )

    await waitFor(() => {
      expect(screen.getByText("管理员")).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: "分配权限" })).not.toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "编辑" })).toHaveLength(2)
  })

  it("新增角色：打开 Dialog 填表提交 → POST /api/roles 携带表单数据", async () => {
    const fetchMock = createFetchMock()
    renderRolePage(fetchMock)

    await waitFor(() => {
      expect(screen.getByText("管理员")).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole("button", { name: "新增角色" }))

    const nameInput = await screen.findByLabelText("角色名称")
    fireEvent.change(nameInput, { target: { value: "运营" } })
    fireEvent.change(screen.getByLabelText("角色编码"), { target: { value: "OPERATOR" } })
    fireEvent.change(screen.getByLabelText("描述"), { target: { value: "运营人员" } })
    fireEvent.change(screen.getByLabelText("排序"), { target: { value: "5" } })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() => {
      expect(fetchBodies(fetchMock, "POST")).toContainEqual({
        name: "运营",
        code: "OPERATOR",
        description: "运营人员",
        sort: 5,
        status: true,
      })
    })
  })

  it("分配权限回显与半选态：仅回显子节点时父目录显示 indeterminate 而非全选", async () => {
    // 后端回显非祖先闭包（如只存了按钮 b1）：半选态必须正确呈现
    const fetchMock = createFetchMock({ grantIds: ["b1"] })
    await openGrantDialog(fetchMock)

    // 对话框提示覆盖语义；回显节点勾选（回显经 effect 写入，waitFor 等 effect flush）
    expect(await screen.findByRole("dialog")).toHaveTextContent("覆盖原有权限")
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "用户新增" })).toBeChecked()
    })
    expect(screen.getByRole("checkbox", { name: "用户编辑" })).not.toBeChecked()
    // 祖先部分选中：indeterminate（aria-checked=mixed），不得误标全选
    expect(screen.getByRole("checkbox", { name: "用户管理" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    )
    expect(screen.getByRole("checkbox", { name: "系统管理" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    )
  })

  it("树形勾选联动：勾选子节点自动带上全部祖先", async () => {
    const fetchMock = createFetchMock()
    await openGrantDialog(fetchMock)

    // 空回显：全树未勾选
    expect(await screen.findByRole("checkbox", { name: "系统管理" })).not.toBeChecked()

    fireEvent.click(screen.getByRole("checkbox", { name: "用户新增" }))
    // 自身 + 祖先 m1/d1 自动选中
    expect(screen.getByRole("checkbox", { name: "用户新增" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "用户管理" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "系统管理" })).toBeChecked()
    // 非祖先/后代不受影响
    expect(screen.getByRole("checkbox", { name: "用户编辑" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "角色管理" })).not.toBeChecked()
  })

  it("树形勾选联动：取消父节点级联取消全部后代", async () => {
    // 回显闭合子集 {m2, b3}（父+子），d1 因部分后代选中呈半选
    const fetchMock = createFetchMock({ grantIds: ["m2", "b3"] })
    await openGrantDialog(fetchMock)

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "角色管理" })).toBeChecked()
    })
    expect(screen.getByRole("checkbox", { name: "分配权限" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "系统管理" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    )

    fireEvent.click(screen.getByRole("checkbox", { name: "角色管理" }))
    // 父节点与其全部后代级联取消；无勾选的祖先同步取消半选态
    expect(screen.getByRole("checkbox", { name: "角色管理" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "分配权限" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "系统管理" })).not.toBeChecked()
  })

  it("树形勾选联动：取消父节点后清理孤儿祖先（勾选 b1 → 取消 m1 → 全树清空）", async () => {
    const fetchMock = createFetchMock()
    await openGrantDialog(fetchMock)

    // 勾选 b1：自动带上 m1/d1
    fireEvent.click(await screen.findByRole("checkbox", { name: "用户新增" }))
    expect(screen.getByRole("checkbox", { name: "系统管理" })).toBeChecked()
    // 取消 m1：m1 子树级联取消，且 d1 无剩余选中后代 → 孤儿祖先一并清理
    fireEvent.click(screen.getByRole("checkbox", { name: "用户管理" }))
    expect(screen.getByRole("checkbox", { name: "用户新增" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "用户编辑" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "用户管理" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "系统管理" })).not.toBeChecked()
  })

  it("树形勾选联动：点击半选父节点全选整个子树（父 + 全部后代）", async () => {
    // 回显仅 {b1}（非闭包数据）：m1 呈半选态
    const fetchMock = createFetchMock({ grantIds: ["b1"] })
    await openGrantDialog(fetchMock)

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "用户管理" })).toHaveAttribute(
        "aria-checked",
        "mixed",
      )
    })
    // 点击半选父节点（native 语义 → 勾选）：自身 + 全部后代 + 祖先
    fireEvent.click(screen.getByRole("checkbox", { name: "用户管理" }))
    expect(screen.getByRole("checkbox", { name: "用户管理" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "用户新增" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "用户编辑" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "系统管理" })).toBeChecked()
  })

  it("回显查询未就绪时保存按钮禁用（防误存空集清空权限）", async () => {
    const fetchMock = createFetchMock({ pendingMenus: true })
    await openGrantDialog(fetchMock)

    await waitFor(() => {
      expect(screen.getByText("菜单加载中…")).toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  })

  it("保存 → PUT /api/roles/{id}/menus 全量提交（含自动带上的祖先与按钮节点）", async () => {
    const fetchMock = createFetchMock()
    await openGrantDialog(fetchMock)

    // 勾选按钮 b1（自动带 m1/d1）+ 勾选按钮 b3（自动带 m2）
    fireEvent.click(await screen.findByRole("checkbox", { name: "用户新增" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "分配权限" }))
    fireEvent.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() => {
      expect(fetchUrls(fetchMock, "PUT")).toContain("/api/roles/r1/menus")
      const body = fetchBodies(fetchMock, "PUT")[0]
      expect(body).toBeDefined()
      expect(body?.menuIds).toEqual(expect.arrayContaining(["d1", "m1", "b1", "m2", "b3"]))
      // 保存成功后对话框关闭
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })
})
