import type { JSX } from "react"

import type { components } from "@/api/schema"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronRightIcon, FileIcon, FolderIcon } from "lucide-react"

export type MenuNode = components["schemas"]["MenuNode"]

/**
 * 收集节点自身 + 全部后代 id（取消勾选时级联取消用）。
 * 递归通用：不假设节点类型（BUTTON 约束无子级由后端保证，此处不特殊处理）。
 */
export function collectSelfAndDescendantIds(node: MenuNode): string[] {
  return [node.id, ...node.children.flatMap((child) => collectSelfAndDescendantIds(child))]
}

/**
 * 在 nodes 子树中查找 nodeId 的祖先链（自近根向下，勾选时自动带上的父目录）：
 * 命中顶层节点返回 []（无祖先）；在子树中找到则把当前节点作为祖先拼接其自身
 * 的祖先链；整棵树都找不到返回 null（数据异常兜底）。
 */
function findAncestorChain(nodeId: string, nodes: MenuNode[]): MenuNode[] | null {
  for (const node of nodes) {
    if (node.id === nodeId) return []
    const chain = findAncestorChain(nodeId, node.children)
    if (chain !== null) return [node, ...chain]
  }
  return null
}

export function collectAncestorIds(nodeId: string, nodes: MenuNode[]): string[] {
  return (findAncestorChain(nodeId, nodes) ?? []).map((node) => node.id)
}

/**
 * 取消勾选后需清理的孤儿祖先 id（自下而上）：某祖先不再有任何仍选中的后代时移除
 * （该祖先自身在 selected 中同样清理——全选语义下"空目录授权"无实际意义）；
 * 一旦遇到仍有选中后代的祖先即停止（其上方祖先必然也持有该后代）。
 */
export function collectOrphanAncestorIds(
  nodeId: string,
  selected: Set<string>,
  allNodes: MenuNode[],
): string[] {
  const chain = findAncestorChain(nodeId, allNodes) ?? []
  const orphans: string[] = []
  // 自下而上（最近祖先优先）：无剩余选中后代的祖先逐个清理，遇仍有后代的祖先即停
  for (const ancestor of [...chain].reverse()) {
    if (hasSelectedDescendant(ancestor, selected)) break
    orphans.push(ancestor.id)
  }
  return orphans
}

function hasSelectedDescendant(node: MenuNode, selected: Set<string>): boolean {
  return node.children.some(
    (child) => selected.has(child.id) || hasSelectedDescendant(child, selected),
  )
}

/** 类型 Badge 配色：目录/菜单/按钮一屏可辨 */
function badgeVariant(type: MenuNode["type"]): "default" | "outline" | "secondary" {
  if (type === "BUTTON") return "default"
  if (type === "MENU") return "outline"
  return "secondary"
}

/**
 * 菜单授权树形勾选（受控组件，父组件持有 selected Set）。
 * 树形结构参照 shadcn 官方 file-tree 区块：目录用 Collapsible 折叠（chevron 旋转 +
 * Folder 图标）、叶子用 Button 行（File 图标）、ml-5 缩进；行首 Checkbox 承载授权勾选：
 * - checked = 节点在 selected 中；indeterminate = 未全选但部分后代在 selected 中
 *   （回显数据可能不是祖先闭包——如后端直存了子节点——此时祖先呈现半选态而非误标全选）
 * - onToggle(node, checked) 由父组件按对称联动规则改写 Set（勾选带祖先+全子项、
 *   取消级联后代并清理孤儿祖先；半选态仅在回显非闭包数据时可达）
 * 半选视觉经 data-indeterminate 样式区分（shadcn 的 Indicator 恒渲染对勾——半选时对勾
 * 半透明以示区别；真实交互中半选态不可达，仅回显非闭包数据时出现，透明度区分足够）。
 */
export function TreeCheckbox({
  nodes,
  selected,
  onToggle,
}: {
  nodes: MenuNode[]
  selected: Set<string>
  onToggle: (node: MenuNode, checked: boolean) => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      {nodes.map((node) => {
        const checked = selected.has(node.id)
        const indeterminate =
          !checked && collectSelfAndDescendantIds(node).some((id) => selected.has(id))
        const checkbox = (
          <Checkbox
            aria-label={node.nameZh}
            checked={checked}
            indeterminate={indeterminate}
            onCheckedChange={(next) => {
              onToggle(node, next)
            }}
            className="shrink-0 data-indeterminate:[&>svg]:opacity-40"
          />
        )

        // 目录（有子节点）：Collapsible 折叠行——checkbox + chevron + 文件夹图标 + 名称 + 类型
        if (node.children.length > 0) {
          return (
            <Collapsible key={node.id} className="group/collapsible" defaultOpen>
              <div className="flex items-center gap-1.5">
                {checkbox}
                <CollapsibleTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 transition-none hover:bg-accent hover:text-accent-foreground"
                    />
                  }
                >
                  <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-open/collapsible:rotate-90" />
                  <FolderIcon className="size-4 shrink-0" />
                  <span className="truncate">{node.nameZh}</span>
                  <Badge variant={badgeVariant(node.type)} className="ml-auto">
                    {node.type}
                  </Badge>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="ml-5 mt-1 flex flex-col gap-1">
                  <TreeCheckbox nodes={node.children} selected={selected} onToggle={onToggle} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          )
        }

        // 叶子（BUTTON 等无子节点）：checkbox + 文件图标 + 名称 + 类型
        return (
          <div key={node.id} className="flex items-center gap-1.5">
            {checkbox}
            <Button
              variant="link"
              size="sm"
              className="w-full justify-start gap-2 px-2.5 text-foreground"
            >
              <FileIcon className="size-4 shrink-0" />
              <span className="truncate">{node.nameZh}</span>
              <Badge variant={badgeVariant(node.type)} className="ml-auto">
                {node.type}
              </Badge>
            </Button>
          </div>
        )
      })}
    </div>
  )
}
