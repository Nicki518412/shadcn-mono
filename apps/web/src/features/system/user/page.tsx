import { useState } from "react"
import type { JSX } from "react"

import { Permission } from "@/components/business/Permission"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RoleAssignDialog } from "./RoleAssignDialog"
import { UserFormDialog } from "./UserFormDialog"
import { useRemoveUserMutation, useUsersQuery } from "./useUsers"
import type { UserListItem } from "./useUsers"

const PAGE_SIZE = 10

/** 后端返回 ISO 时间字符串；非法值原样展示（兜底，正常不会走到） */
function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false })
}

/**
 * 用户管理页（Task 20）：分页列表 + 关键词搜索 + 新增/编辑 Dialog + 删除 AlertDialog +
 * 分配角色 Dialog；所有操作按钮由 <Permission> 按按钮级权限码门控。
 */
export default function UserPage(): JSX.Element {
  const [page, setPage] = useState(1)
  const [keywordInput, setKeywordInput] = useState("")
  const [keyword, setKeyword] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null)
  const [assignUser, setAssignUser] = useState<UserListItem | null>(null)
  const [deleteUser, setDeleteUser] = useState<UserListItem | null>(null)
  const removeMutation = useRemoveUserMutation()

  const { data, isLoading, isError, error } = useUsersQuery(page, PAGE_SIZE, keyword)
  const users = data?.list ?? []
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  function applyKeyword(): void {
    setKeyword(keywordInput.trim())
    setPage(1)
  }

  function confirmDelete(): void {
    if (!deleteUser) return
    removeMutation.mutate(deleteUser.id, { onSuccess: () => { setDeleteUser(null); } })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-lg font-medium">用户管理</h1>
        <div className="flex items-center gap-2">
          <Input
            value={keywordInput}
            onChange={(event) => {
              setKeywordInput(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyKeyword()
            }}
            placeholder="搜索用户名/昵称/邮箱/手机号"
            className="w-64"
          />
          <Button variant="outline" type="button" onClick={applyKeyword}>
            搜索
          </Button>
          <Permission code="system:user:create">
            <Button
              type="button"
              onClick={() => {
                setEditingUser(null)
                setFormOpen(true)
              }}
            >
              新增用户
            </Button>
          </Permission>
        </div>
      </div>

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}

      {!isLoading && users.length === 0 ? (
        <Empty className="py-16">
          <EmptyContent>
            <EmptyTitle>暂无用户</EmptyTitle>
            <EmptyDescription>
              {keyword
                ? "未找到匹配的用户，请调整搜索关键词"
                : "点击右上角「新增用户」创建第一个用户"}
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>昵称</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>手机号</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }, (_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {Array.from({ length: 8 }, (_, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.nickname}</TableCell>
                    <TableCell>{user.email ?? "-"}</TableCell>
                    <TableCell>{user.telephone ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={user.status ? "default" : "destructive"}>
                        {user.status ? "启用" : "禁用"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.roles.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <Badge key={role.id} variant="outline">
                              {role.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(user.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Permission code="system:user:update">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingUser(user)
                              setFormOpen(true)
                            }}
                          >
                            编辑
                          </Button>
                        </Permission>
                        <Permission code="system:user:assign-role">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAssignUser(user)
                            }}
                          >
                            分配角色
                          </Button>
                        </Permission>
                        <Permission code="system:user:delete">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteUser(user)
                            }}
                          >
                            删除
                          </Button>
                        </Permission>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      )}

      <Pagination className="justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              text="上一页"
              aria-label="上一页"
              onClick={(event) => {
                event.preventDefault()
                if (page > 1) setPage(page - 1)
              }}
            />
          </PaginationItem>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <PaginationItem key={pageNumber}>
              <PaginationLink
                isActive={pageNumber === page}
                onClick={(event) => {
                  event.preventDefault()
                  setPage(pageNumber)
                }}
              >
                {pageNumber}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              text="下一页"
              aria-label="下一页"
              onClick={(event) => {
                event.preventDefault()
                if (page < totalPages) setPage(page + 1)
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      {formOpen && (
        <UserFormDialog
          user={editingUser}
          onClose={() => {
            setFormOpen(false)
            setEditingUser(null)
          }}
        />
      )}

      {assignUser && (
        <RoleAssignDialog
          user={assignUser}
          onClose={() => {
            setAssignUser(null)
          }}
        />
      )}

      {deleteUser && (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setDeleteUser(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除用户</AlertDialogTitle>
              <AlertDialogDescription>
                确定删除用户「{deleteUser.username}」？该操作不可恢复。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={confirmDelete}
                disabled={removeMutation.isPending}
              >
                {removeMutation.isPending ? "删除中…" : "删除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
