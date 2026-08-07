import { useState } from "react"
import type { JSX, SyntheticEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components, paths } from "@/api/schema"
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ME_QUERY_KEY } from "@/router/guards"

/** PATCH /api/users/me 请求体（openapi-typescript 生成类型，随 schema.d.ts 自动同步） */
type MeUpdateInput = NonNullable<
  paths["/api/users/me"]["patch"]["requestBody"]
>["content"]["application/json"]

/**
 * 用户设置弹窗：登录人修改自己的个人资料（昵称/邮箱/手机号）。
 * - 邮箱/手机号留空 = 清空（后端 null 语义）；唯一冲突 409 直接展示
 * - 保存成功后失效 me 缓存（侧边栏昵称/用户菜单信息同步刷新）
 */
export function ProfileDialog({
  user,
  onClose,
}: {
  user: components["schemas"]["UserPublic"]
  onClose: () => void
}): JSX.Element {
  const queryClient = useQueryClient()
  const [nickname, setNickname] = useState(user.nickname)
  const [email, setEmail] = useState(user.email ?? "")
  const [telephone, setTelephone] = useState(user.telephone ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!nickname.trim()) {
      setError("请输入昵称")
      return
    }
    setError(null)
    setPending(true)
    const body: MeUpdateInput = {
      nickname: nickname.trim(),
      email: email.trim() === "" ? null : email.trim(),
      telephone: telephone.trim() === "" ? null : telephone.trim(),
    }
    api<unknown>("/users/me", { method: "PATCH", body: JSON.stringify(body) })
      .then(() => {
        toast.success("资料已更新")
        void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
        onClose()
      })
      .catch((err: unknown) => {
        setError(apiErrorMessage(err))
      })
      .finally(() => {
        setPending(false)
      })
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
          <DialogTitle>用户设置</DialogTitle>
          <DialogDescription>修改你的个人资料（昵称 / 邮箱 / 手机号）</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-nickname">昵称</FieldLabel>
              <FieldContent>
                <Input
                  id="profile-nickname"
                  value={nickname}
                  onChange={(event) => {
                    setNickname(event.target.value)
                  }}
                  placeholder="显示昵称"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-email">邮箱</FieldLabel>
              <FieldContent>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                  }}
                  placeholder="name@example.com"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-telephone">手机号</FieldLabel>
              <FieldContent>
                <Input
                  id="profile-telephone"
                  value={telephone}
                  onChange={(event) => {
                    setTelephone(event.target.value)
                  }}
                  placeholder="13800138000"
                />
              </FieldContent>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
              className="h-9"
            >
              取消
            </Button>
            <Button type="submit" disabled={pending} className="h-9">
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
