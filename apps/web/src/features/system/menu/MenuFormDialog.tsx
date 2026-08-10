import { useEffect, useState } from "react"
import type { JSX, SyntheticEvent } from "react"
import { useTranslation } from "react-i18next"
import { ChevronsUpDownIcon, ImageIcon } from "lucide-react"

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { ICON_CHOICES, iconByName } from "@/lib/icons"
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
  const { t } = useTranslation("menus")
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
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
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
    if (name.trim().length < 2) return t("menuNameMinLength")
    if (type === "MENU" && (!path.trim() || !component.trim())) {
      return t("menuRequiresPath")
    }
    if (type === "BUTTON" && parentId === "") return t("buttonRequiresParent")
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
          <DialogTitle>{isEdit ? t("editTitle") : t("addMenu")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editDesc") : t("createDesc")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="-mx-4 max-h-[50vh] overflow-y-auto px-4 no-scrollbar">
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
              <FieldLabel htmlFor="menu-form-name">{t("menuName")}</FieldLabel>
              <FieldContent>
                <Input
                  id="menu-form-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                  }}
                  placeholder={t("menuNamePlaceholder")}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="menu-form-type">{t("type")}</FieldLabel>
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
                    <SelectValue placeholder={t("typePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIR">DIR</SelectItem>
                    <SelectItem value="MENU">MENU</SelectItem>
                    <SelectItem value="BUTTON">BUTTON</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>{t("typeDesc")}</FieldDescription>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="menu-form-parent">{t("parent")}</FieldLabel>
              <FieldContent>
                <Select
                  value={parentId}
                  onValueChange={(value) => {
                    if (value !== null) setParentId(value)
                  }}
                >
                  <SelectTrigger id="menu-form-parent" className="w-full">
                    {/* children 函数自控映射 value → 名称：Base UI 对 span 结构（缩进）的
                        item label 提取不可靠，显示会回退到 value（菜单 id）——显式映射最可靠 */}
                    <SelectValue>
                      {(value) =>
                        parentOptions.find((option) => option.id === value)?.name ??
                        t("noParent")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {type !== "BUTTON" && <SelectItem value="">{t("noParent")}</SelectItem>}
                    {parentOptions.map((option) => (
                      // label 显式传给 Base UI（ItemText 内是 span 缩进结构，文本提取会失败
                      // 回退显示 value——显式 label 保证 trigger 显示菜单名称）
                      <SelectItem key={option.id} value={option.id} label={option.name}>
                        <span style={{ paddingLeft: `${String(option.depth * 12)}px` }}>
                          {option.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {type === "BUTTON"
                    ? t("parentDescButton")
                    : isEdit
                      ? t("parentDescEdit")
                      : t("parentDescCreate")}
                </FieldDescription>
              </FieldContent>
            </Field>
            {type === "MENU" && (
              <>
                <Field>
                  <FieldLabel htmlFor="menu-form-path">{t("routePath")}</FieldLabel>
                  <FieldContent>
                    <Input
                      id="menu-form-path"
                      value={path}
                      onChange={(event) => {
                        setPath(event.target.value)
                      }}
                      placeholder={t("routePathPlaceholder")}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="menu-form-component">{t("component")}</FieldLabel>
                  <FieldContent>
                    <Input
                      id="menu-form-component"
                      value={component}
                      onChange={(event) => {
                        setComponent(event.target.value)
                      }}
                      placeholder={t("componentPlaceholder")}
                    />
                  </FieldContent>
                </Field>
              </>
            )}
            {/* BUTTON 无图标（不进入导航树，图标无意义）——仅 DIR/MENU 显示图标选择器 */}
            {type !== "BUTTON" && (
            <Field>
              <FieldLabel>{t("icon")}</FieldLabel>
              <FieldContent>
                {/* 图标选择器：Popover + lucide 常用图标网格（icon 字段存图标名，DIR/MENU 用） */}
                <Popover
                  open={iconPickerOpen}
                  onOpenChange={setIconPickerOpen}
                >
                  <PopoverTrigger
                    render={
                      <Button variant="outline" className="w-full justify-start gap-2" />
                    }
                  >
                    {iconByName(icon) ? (
                      (() => {
                        const Icon = iconByName(icon)
                        return Icon ? <Icon className="size-4 shrink-0" /> : null
                      })()
                    ) : (
                      <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-muted-foreground">
                      {icon || t("selectIcon")}
                    </span>
                    <ChevronsUpDownIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="start">
                    <div className="grid grid-cols-6 gap-1">
                      <button
                        type="button"
                        aria-label={t("clearIcon")}
                        title={t("clearIcon")}
                        onClick={() => {
                          setIcon("")
                          setIconPickerOpen(false)
                        }}
                        className="flex aspect-square items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <ImageIcon className="size-4" />
                      </button>
                      {ICON_CHOICES.map(({ name, icon: Icon }) => (
                        <button
                          key={name}
                          type="button"
                          aria-label={name}
                          title={name}
                          onClick={() => {
                            setIcon(name)
                            setIconPickerOpen(false)
                          }}
                          className={cn(
                            "flex aspect-square items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
                            icon === name && "bg-accent text-accent-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <FieldDescription>{t("iconDesc")}</FieldDescription>
              </FieldContent>
            </Field>
            )}
            <Field>
              <FieldLabel htmlFor="menu-form-permission">{t("permission")}</FieldLabel>
              <FieldContent>
                <Input
                  id="menu-form-permission"
                  value={permission}
                  onChange={(event) => {
                    setPermission(event.target.value)
                  }}
                  placeholder={t("permissionPlaceholder")}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="menu-form-sort">{t("sort")}</FieldLabel>
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
              <FieldLabel htmlFor="menu-form-status">{t("enabled")}</FieldLabel>
            </Field>
          </FieldGroup>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
              className="h-9"
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending} className="h-9">
              {pending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
