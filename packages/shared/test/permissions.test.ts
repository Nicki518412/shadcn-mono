import { describe, expect, it } from "vitest"
import { buildTree, computeVisibleMenus } from "../src/permissions.js"
import type { MenuNode } from "../src/types.js"

function menu(partial: Partial<MenuNode> & { id: string }): MenuNode {
  return {
    parentId: null,
    nameZh: partial.id,
    nameEn: null,
    type: "MENU",
    path: null,
    component: null,
    icon: null,
    permission: null,
    sort: 0,
    status: true,
    children: [],
    ...partial,
  }
}

const dirSystem = menu({ id: "d1", nameZh: "系统管理", type: "DIR", sort: 1 })
const dirEmpty = menu({ id: "d2", nameZh: "空目录", type: "DIR", sort: 2 })
const mUser = menu({ id: "m1", parentId: "d1", nameZh: "用户管理", permission: "system:user:query", sort: 1 })
const bAdd = menu({ id: "b1", parentId: "m1", nameZh: "用户新增", type: "BUTTON", permission: "system:user:add", sort: 1 })
const mRole = menu({ id: "m2", parentId: "d1", nameZh: "角色管理", permission: "system:role:query", sort: 2 })
const allMenus = [dirSystem, mUser, bAdd, mRole, dirEmpty]

describe("computeVisibleMenus", () => {
  it("无角色时返回空", () => {
    const r = computeVisibleMenus([], allMenus)
    expect(r.navTree).toEqual([])
    expect(r.permissionCodes.size).toBe(0)
  })

  it("任一角色为空数组 ⇒ 权限为空", () => {
    const r = computeVisibleMenus([["d1", "m1"], []], allMenus)
    expect(r.navTree).toEqual([])
    expect(r.permissionCodes.size).toBe(0)
  })

  it("单角色返回其菜单", () => {
    const r = computeVisibleMenus([["d1", "m1", "b1"]], allMenus)
    expect(r.navTree.map((n) => n.id)).toEqual(["d1"])
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["m1"])
    expect(r.permissionCodes).toEqual(new Set(["system:user:query", "system:user:add"]))
    expect(allMenus[0]?.children).toEqual([])
  })

  it("多角色取严格交集（菜单与按钮）", () => {
    const r = computeVisibleMenus([["d1", "m1", "b1", "m2"], ["d1", "m1", "b1"]], allMenus)
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["m1"])
    expect(r.permissionCodes).toEqual(new Set(["system:user:query", "system:user:add"]))
  })

  it("按钮被交集剔除", () => {
    const r = computeVisibleMenus([["d1", "m1", "b1", "m2"], ["d1", "m1"]], allMenus)
    expect(r.navTree.map((n) => n.id)).toEqual(["d1"])
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["m1"])
    expect(r.permissionCodes).toEqual(new Set(["system:user:query"]))
  })

  it("交集为空时导航树为空", () => {
    const r = computeVisibleMenus([["m2"], ["m1"]], allMenus)
    expect(r.navTree).toEqual([])
  })

  it("祖先补全：菜单在交集但目录不在时仍显示祖先链", () => {
    const r = computeVisibleMenus([["m1"]], allMenus)
    expect(r.navTree.map((n) => n.id)).toEqual(["d1"])
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["m1"])
  })

  it("空目录折叠：目录无可见子孙则隐藏", () => {
    const r = computeVisibleMenus([["d1", "m1", "d2"]], allMenus)
    expect(r.navTree.map((n) => n.id)).toEqual(["d1"])
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["m1"])
  })

  it("嵌套空目录折叠：中间目录变空壳后也应移除", () => {
    const a = menu({ id: "a", nameZh: "A", type: "DIR", sort: 1 })
    const b = menu({ id: "b", parentId: "a", nameZh: "B", type: "DIR", sort: 1 })
    const r = computeVisibleMenus([["a", "b"]], [a, b])
    expect(r.navTree).toEqual([])
  })

  it("嵌套非空目录保留整条链", () => {
    const a = menu({ id: "a", nameZh: "A", type: "DIR", sort: 1 })
    const b = menu({ id: "b", parentId: "a", nameZh: "B", type: "DIR", sort: 1 })
    const m = menu({ id: "m", parentId: "b", nameZh: "M", sort: 1 })
    const r = computeVisibleMenus([["a", "b", "m"]], [a, b, m])
    expect(r.navTree.map((n) => n.id)).toEqual(["a"])
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["b"])
    expect(r.navTree[0]?.children[0]?.children.map((n) => n.id)).toEqual(["m"])
  })

  it("按 sort 排序", () => {
    const r = computeVisibleMenus([["d1", "m2", "m1"]], allMenus)
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["m1", "m2"])
  })

  it("按钮不进入导航树", () => {
    const r = computeVisibleMenus([["b1"]], allMenus)
    expect(r.navTree).toEqual([])
    expect(r.permissionCodes).toEqual(new Set(["system:user:add"]))
  })
})

describe("buildTree", () => {
  it("乱序节点构建排序后的树", () => {
    const a = menu({ id: "a", nameZh: "A", type: "DIR", sort: 2 })
    const b = menu({ id: "b", parentId: "a", nameZh: "B", sort: 1 })
    const c = menu({ id: "c", parentId: "a", nameZh: "C", sort: 2 })
    const m = menu({ id: "m", parentId: "b", nameZh: "M", sort: 1 })
    const tree = buildTree([m, a, c, b])
    expect(tree.map((n) => n.id)).toEqual(["a"])
    expect(tree[0]?.children.map((n) => n.id)).toEqual(["b", "c"])
    expect(tree[0]?.children[0]?.children.map((n) => n.id)).toEqual(["m"])
  })
})
