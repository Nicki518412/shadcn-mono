import { describe, expect, it } from "vitest"
import type { components } from "../src/api/schema"
import { filterNavigableMenus, menuToRoutes } from "../src/router/generateRoutes"

type MenuNode = components["schemas"]["MenuNode"]

function menu(overrides: Partial<MenuNode> & Pick<MenuNode, "id" | "name" | "type">): MenuNode {
  return {
    parentId: null,
    nameEn: null,
    path: null,
    component: null,
    icon: null,
    permission: null,
    sort: 0,
    status: true,
    children: [],
    ...overrides,
  }
}

describe("dynamic routes", () => {
  it("过滤未注册页面并折叠空目录", () => {
    const tree = [
      menu({
        id: "valid-dir",
        name: "有效目录",
        type: "DIR",
        children: [
          menu({ id: "dashboard", name: "Dashboard", type: "MENU", path: "/", component: "dashboard" }),
        ],
      }),
      menu({
        id: "empty-dir",
        name: "空目录",
        type: "DIR",
        children: [
          menu({ id: "missing", name: "缺失页面", type: "MENU", path: "/missing", component: "missing/page" }),
        ],
      }),
    ]

    const filtered = filterNavigableMenus(tree)
    expect(filtered.map((node) => node.id)).toEqual(["valid-dir"])
    expect(filtered[0]?.children.map((node) => node.id)).toEqual(["dashboard"])
    expect(menuToRoutes(filtered).map((route) => route.path)).toEqual(["/"])
  })
})
