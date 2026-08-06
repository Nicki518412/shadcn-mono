import { useEffect, useState } from "react"
import type { JSX, SyntheticEvent } from "react"

import { collectSelfAndDescendantIds } from "@/components/business/TreeCheckbox"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useCreateMenuMutation, useMenuTreeQuery, useUpdateMenuMutation } from "./useMenus"
import type { MenuCreateInput, MenuNode } from "./useMenus"

type MenuType = MenuNode["type"]

/** 父子类型约束（设计文档 §4）：DIR → DIR/MENU；MENU → BUTTON；BUTTON 无子级 */
const ALLOWED_PARENT_TYPES: Record<MenuType, readonly MenuType[]> = {
  DIR: ["DIR"],
  MENU: ["DIR"],
  BUTTON: ["MENU"],
}

/** 父节点候选（{ id, name, depth }，depth 用于选项缩进）；excludedIds 内节点整棵子树跳过 */
function collectParentOptions(
  list: MenuNode[],
  type: MenuType,
  excludedIds: Set<string>,
  depth: number,
  result: { id: string; name: string; depth: number }[],
): void {
  for (const node of list) {
    if (excludedIds.has(node.id)) continue
    if (ALLOWED_PARENT_TYPES[type].includes(node.type)) {
      result.push({ id: node.id, name: node.name, depth })
    }
    collectParentOptions(node.children, type, excludedIds, depth + 1, result)
  }
}

/** 按 id 在树中查节点（type 变更后校验当前父节点是否仍合法用） */
function findNodeById(list: MenuNode[], id: string): MenuNode | null {
  for (const node of list) {
    if (node.id === id) return node
    const found = findNodeById(node.children, id)
    if (found !== null) return found
  }
  return null
}

/**
 * 新增/编辑菜单 Dialog（页面按条件挂载，每次打开全新初始化）：
 * - 类型约束表单：父节点选项按类型过滤（DIR→父选 DIR、MENU→父选 DIR、BUTTON→父选 MENU；
 *   根选项「无」仅 DIR/MENU 可选——后端 canAttachTo 禁止 BUTTON 为根），
 *   编辑时排除自身及全部后代（防自挂，与后端 collectSubtreeIds 一致）
 * - type 变更后当前父节点不合法时自动重置为空（前置拦截，后端 400 message 仍直接展示兜底）
 * - MENU 显示并必填 path/component（前端校验 + 后端 zod 兜底）；其余类型显式传 null 清空，
 *   避免 MENU→BUTTON 触发后端"BUTTON 类型不允许填写 path 和 component"
 */
export function MenuFormDialog({
  menu,
  onClose,
}: {
  menu?: MenuNode | null
  onClose: () => void
}): JSX.Element {
  const isEdit = Boolean(menu)
  const menuTreeQuery = useMenuTreeQuery()
  const createMutation = useCreateMenuMutation()
  const updateMutation = useUpdateMenuMutation()

  const [name, setName] = useState(menu?.name ?? "")
  const [type, setType] = useState<MenuType>(menu?.type ?? "DIR")
  const [parentId, setParentId] = useState(menu?.parentId ?? "")
  const [path, setPath] = useState(menu?.path ?? "")
  const [component, setComponent] = useState(menu?.component ?? "")
  const [icon, setIcon] = useState(menu?.icon ?? "")
  const [permission, setPermission] = useState(menu?.permission ?? "")
  const [sort, setSort] = useState(menu?.sort ?? 0)
  const [status, setStatus] = useState(menu?.status ?? true)
  const [error, setError] = useState<string | null>(null)
  const pending = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error ?? updateMutation.error

  const nodes = menuTreeQuery.data ?? []
  /** 编辑时自身 + 全部后代 id（递归收集，collectSelfAndDescendantIds 含节点自身） */
  const excludedIds = menu ? new Set(collectSelfAndDescendantIds(menu)) : new Set<string>()
  const parentOptions: { id: string; name: string; depth: number }[] = []
  collectParentOptions(nodes, type, excludedIds, 0, parentOptions)

  // type 变更后原父节点可能不满足新类型约束（如 MENU→BUTTON 后原 DIR 父非法）；
  // 重置为空避免提交后端必然拒绝的组合（400 文案仍会展示，此处仅前置拦截）
  useEffect(() => {
    if (parentId === "" || !menuTreeQuery.data) return
    const parent = findNodeById(menuTreeQuery.data, parentId)
    if (parent && !ALLOWED_PARENT_TYPES[type].includes(parent.type)) setParentId("")
  }, [type, parentId, menuTreeQuery.data])

  function validate(): string | null {
    if (name.trim().length < 2) return "菜单名称至少 2 个字符"
    if (type === "MENU" && (!path.trim() || !component.trim())) {
      return "MENU 类型必须填写 path 和 component"
    }
    if (type === "BUTTON" && parentId === "") return "BUTTON 类型必须选择父菜单"
    return null
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    const message = validate()
    if (message) {
      setError(message)
      return
    }
    setError(null)
    const body: MenuCreateInput = {
      name: name.trim(),
      type,
      parentId: parentId === "" ? null : parentId,
      sort,
      status,
      path: type === "MENU" ? path.trim() : null,
      component: type === "MENU" ? component.trim() : null,
      icon: icon.trim() === "" ? null : icon.trim(),
      permission: permission.trim() === "" ? null : permission.trim(),
    }
    if (isEdit && menu) {
      updateMutation.mutate({ id: menu.id, body }, { onSuccess: () => { onClose(); } })
    } else {
      createMutation.mutate(body, { onSuccess: () => { onClose(); } })
    }
  }

  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑菜单" : "新增菜单"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "修改菜单信息；类型或父节点变更需满足树结构约束"
              : "创建新的系统菜单（目录/菜单/按钮）"}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {mutationError && (
            <p role="alert" className="text-sm text-destructive">
              {mutationError.message}
            </p>
          )}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="menu-form-name">菜单名称</FieldLabel>
              <FieldContent>
                <Input
                  id="menu-form-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                  }}
                  placeholder="菜单显示名称"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="menu-form-type">类型</FieldLabel>
              <FieldContent>
                <Select
                  value={type}
                  onValueChange={(value) => {
                    // onValueChange 的 value 为 MenuType | null（Base UI 泛型推断），null 忽略
                    if (value === null) return
                    setType(value)
                  }}
                >
                  <SelectTrigger id="menu-form-type" className="w-full">
                    <SelectValue placeholder="选择类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIR">DIR</SelectItem>
                    <SelectItem value="MENU">MENU</SelectItem>
                    <SelectItem value="BUTTON">BUTTON</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>类型决定可挂载的子节点（BUTTON 只能挂在 MENU 下）</FieldDescription>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="menu-form-parent">父节点</FieldLabel>
              <FieldContent>
                <Select
                  value={parentId}
                  onValueChange={(value) => {
                    if (value !== null) setParentId(value)
                  }}
                >
                  <SelectTrigger id="menu-form-parent" className="w-full">
                    <SelectValue placeholder="无（根目录）" />
                  </SelectTrigger>
                  <SelectContent>
                    {type !== "BUTTON" && <SelectItem value="">无（根目录）</SelectItem>}
                    {parentOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        <span style={{ paddingLeft: `${String(option.depth * 12)}px` }}>
                          {option.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {type === "BUTTON"
                    ? "按钮必须挂在 MENU 下"
                    : isEdit
                      ? "自身及全部子节点不可选（防自挂）"
                      : "不选即为根节点（目录/菜单可为根）"}
                </FieldDescription>
              </FieldContent>
            </Field>
            {type === "MENU" && (
              <>
                <Field>
                  <FieldLabel htmlFor="menu-form-path">路由路径</FieldLabel>
                  <FieldContent>
                    <Input
                      id="menu-form-path"
                      value={path}
                      onChange={(event) => {
                        setPath(event.target.value)
                      }}
                      placeholder="如 /system/menu"
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="menu-form-component">组件</FieldLabel>
                  <FieldContent>
                    <Input
                      id="menu-form-component"
                      value={component}
                      onChange={(event) => {
                        setComponent(event.target.value)
                      }}
                      placeholder="如 system/menu"
                    />
                  </FieldContent>
                </Field>
              </>
            )}
            <Field>
              <FieldLabel htmlFor="menu-form-icon">图标</FieldLabel>
              <FieldContent>
                <Input
                  id="menu-form-icon"
                  value={icon}
                  onChange={(event) => {
                    setIcon(event.target.value)
                  }}
                  placeholder="lucide 图标名（可选）"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="menu-form-permission">权限码</FieldLabel>
              <FieldContent>
                <Input
                  id="menu-form-permission"
                  value={permission}
                  onChange={(event) => {
                    setPermission(event.target.value)
                  }}
                  placeholder="如 system:menu:create（唯一）"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="menu-form-sort">排序</FieldLabel>
              <FieldContent>
                <Input
                  id="menu-form-sort"
                  type="number"
                  value={sort}
                  onChange={(event) => {
                    // 清空输入视作 0（number input 空串无法直接作为 value）
                    setSort(event.target.value === "" ? 0 : Number(event.target.value))
                  }}
                />
              </FieldContent>
            </Field>
            <Field orientation="horizontal" className="gap-2">
              <Switch
                id="menu-form-status"
                checked={status}
                onCheckedChange={setStatus}
              />
              <FieldLabel htmlFor="menu-form-status">启用</FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
