import { describe, expect, it } from "vitest"
import { computeVisibleMenus } from "../src/permissions.js"
import type { MenuNode } from "../src/types.js"

function menu(partial: Partial<MenuNode> & { id: string }): MenuNode {
  return {
    parentId: null,
    name: partial.id,
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

const dirSystem = menu({ id: "d1", name: "系统管理", type: "DIR", sort: 1 })
const mUser = menu({ id: "m1", parentId: "d1", name: "用户管理", permission: "system:user:query", sort: 1 })
const bAdd = menu({ id: "b1", parentId: "m1", name: "用户新增", type: "BUTTON", permission: "system:user:add", sort: 1 })
const mRole = menu({ id: "m2", parentId: "d1", name: "角色管理", permission: "system:role:query", sort: 2 })
const allMenus = [dirSystem, mUser, bAdd, mRole]

describe("computeVisibleMenus", () => {
  it("无角色时返回空", () => {
    const r = computeVisibleMenus([], allMenus)
    expect(r.navTree).toEqual([])
    expect(r.permissionCodes.size).toBe(0)
  })

  it("单角色返回其菜单", () => {
    const r = computeVisibleMenus([["d1", "m1", "b1"]], allMenus)
    expect(r.navTree.map((n) => n.id)).toEqual(["d1"])
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["m1"])
    expect(r.permissionCodes).toEqual(new Set(["system:user:query", "system:user:add"]))
  })

  it("多角色取严格交集（菜单与按钮）", () => {
    const r = computeVisibleMenus([["d1", "m1", "b1", "m2"], ["d1", "m1", "b1"]], allMenus)
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["m1"])
    expect(r.permissionCodes).toEqual(new Set(["system:user:query", "system:user:add"]))
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
    const r = computeVisibleMenus([["d1", "m1"]], allMenus)
    expect(r.navTree.map((n) => n.id)).toEqual(["d1"])
  })

  it("按 sort 排序", () => {
    const r = computeVisibleMenus([["d1", "m1", "m2"]], allMenus)
    expect(r.navTree[0]?.children.map((n) => n.id)).toEqual(["m1", "m2"])
  })

  it("按钮不进入导航树", () => {
    const r = computeVisibleMenus([["b1"]], allMenus)
    expect(r.navTree).toEqual([])
    expect(r.permissionCodes).toEqual(new Set(["system:user:add"]))
  })
})
