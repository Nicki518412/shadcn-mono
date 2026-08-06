import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"
import type { JSX } from "react"

import type { components } from "@/api/schema"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export type MenuNode = components["schemas"]["MenuNode"]

/**
 * 收集节点自身 + 全部后代 id（取消勾选时级联取消用）。
 * 递归通用：不假设节点类型（BUTTON 约束无子级由后端保证，此处不特殊处理）。
 */
export function collectSelfAndDescendantIds(node: MenuNode): string[] {
  return [node.id, ...node.children.flatMap((child) => collectSelfAndDescendantIds(child))]
}

/**
 * 收集某节点的全部祖先 id（自近根向下，勾选时自动带上的父目录）。
 * 在 nodes 子树中查找 nodeId：命中顶层节点返回 []（无祖先）；在子树中找到则把
 * 当前节点作为祖先拼接其自身的祖先链；整棵树都找不到返回 []（数据异常兜底）。
 */
function findAncestorChain(nodeId: string, nodes: MenuNode[]): string[] | null {
  for (const node of nodes) {
    if (node.id === nodeId) return []
    const chain = findAncestorChain(nodeId, node.children)
    if (chain !== null) return [node.id, ...chain]
  }
  return null
}

export function collectAncestorIds(nodeId: string, nodes: MenuNode[]): string[] {
  return findAncestorChain(nodeId, nodes) ?? []
}

/** 类型 Badge 配色：目录/菜单/按钮一屏可辨 */
function badgeVariant(type: MenuNode["type"]): "default" | "outline" | "secondary" {
  if (type === "BUTTON") return "default"
  if (type === "MENU") return "outline"
  return "secondary"
}

/**
 * 菜单授权树形勾选（受控组件，父组件持有 selected Set）：
 * - checked = 节点在 selected 中；indeterminate = 未全选但部分后代在 selected 中
 *   （回显数据可能不是祖先闭包——如后端直存了子节点——此时祖先呈现半选态而非误标全选）
 * - onToggle(node, checked) 由父组件按联动规则改写 Set（勾选带祖先/取消级联后代）
 * 复选框为手写渲染（Base UI Root + 半选 MinusIcon）：ui/checkbox.tsx 属 shadcn CLI 管理
 * 产物禁止手写修改，且其 Indicator 恒渲染 CheckIcon，无法表达半选态。
 */
export function TreeCheckbox({
  nodes,
  selected,
  onToggle,
  depth = 0,
}: {
  nodes: MenuNode[]
  selected: Set<string>
  onToggle: (node: MenuNode, checked: boolean) => void
  depth?: number
}): JSX.Element {
  return (
    <>
      {nodes.map((node) => {
        const checked = selected.has(node.id)
        const indeterminate = !checked && collectSelfAndDescendantIds(node).some((id) => selected.has(id))
        const checkboxId = `menu-grant-${node.id}`
        return (
          <div key={node.id}>
            <div
              className="flex items-center gap-2"
              style={{ paddingLeft: `${String(depth * 24)}px` }}
            >
              <CheckboxPrimitive.Root
                id={checkboxId}
                checked={checked}
                indeterminate={indeterminate}
                onCheckedChange={(next) => { onToggle(node, next) }}
                className={cn(
                  "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                  "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
                  "data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground",
                )}
              >
                <CheckboxPrimitive.Indicator className="grid place-content-center text-current transition-none [&>svg]:size-3.5">
                  {indeterminate ? <MinusIcon /> : <CheckIcon />}
                </CheckboxPrimitive.Indicator>
              </CheckboxPrimitive.Root>
              <Label htmlFor={checkboxId} className="text-sm font-normal">
                {node.name}
              </Label>
              <Badge variant={badgeVariant(node.type)}>{node.type}</Badge>
            </div>
            {node.children.length > 0 && (
              <TreeCheckbox
                nodes={node.children}
                selected={selected}
                onToggle={onToggle}
                depth={depth + 1}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
