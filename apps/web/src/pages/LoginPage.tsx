import { useEffect, useState } from "react"
import { SignIn } from "@clerk/clerk-react"
import { useQueryClient } from "@tanstack/react-query"
import { useLocation, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"

import { useAuth } from "@/auth/AuthProvider"
import type { OtpChannel } from "@/auth/types"
import { APP_NAME } from "@/config"
import { LanguageToggle } from "@/components/business/LanguageToggle"
import { ThemeToggle } from "@/components/business/ThemeToggle"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ME_QUERY_KEY } from "@/router/guards"

/** 发送动态码后的冷却秒数 */
const OTP_SEND_COOLDOWN_SECONDS = 60

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "操作失败，请重试"
}

/**
 * 邮箱 / 手机动态码 Tab 表单（两个 Tab 结构一致，仅 channel 与文案不同——文案经 i18n）。
 * 输入状态在本地维护；面板随 Tab 切换卸载，切走再切回需重新输入（可接受）。
 */
function OtpLoginForm({
  channel,
  cooldown,
  sending,
  pending,
  onSend,
  onLogin,
}: {
  channel: OtpChannel
  cooldown: number
  sending: boolean
  pending: boolean
  onSend: (target: string) => void
  onLogin: (target: string, code: string) => void
}) {
  const { t } = useTranslation("login")
  const [target, setTarget] = useState("")
  const [code, setCode] = useState("")
  const label = channel === "email" ? t("email") : t("phone")
  const placeholder = channel === "email" ? t("emailPlaceholder") : t("phonePlaceholder")

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        onLogin(target, code)
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`login-otp-${channel}-target`}>{label}</FieldLabel>
          <FieldContent>
            <div className="flex items-center gap-2">
              <Input
                id={`login-otp-${channel}-target`}
                value={target}
                onChange={(event) => {
                  setTarget(event.target.value)
                }}
                placeholder={placeholder}
                className="h-10"
              />
              <Button
                type="button"
                variant="outline"
                disabled={cooldown > 0 || sending}
                onClick={() => {
                  onSend(target)
                }}
                className="h-10 w-28 shrink-0"
              >
                {cooldown > 0 ? (
                  t("resendIn", { seconds: cooldown })
                ) : sending ? (
                  <>
                    <Spinner /> {t("sending")}
                  </>
                ) : (
                  t("sendCode")
                )}
              </Button>
            </div>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor={`login-otp-${channel}-code`}>{t("verifyCode")}</FieldLabel>
          <FieldContent>
            <InputOTP
              id={`login-otp-${channel}-code`}
              maxLength={6}
              value={code}
              onChange={setCode}
              inputMode="numeric"
              containerClassName="w-full justify-center"
            >
              {/* 适中尺寸格子（size-9）居中排列，加大间距（gap-3） */}
              <InputOTPGroup className="gap-3">
                {[0, 1, 2, 3, 4, 5].map((slotIndex) => (
                  <InputOTPSlot key={slotIndex} index={slotIndex} className="size-9 rounded-md" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </FieldContent>
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending} className="h-10 w-full">
        {pending ? (
          <>
            <Spinner /> {t("loggingIn")}
          </>
        ) : (
          t("login")
        )}
      </Button>
    </form>
  )
}

export default function LoginPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation("login")

  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sendingChannel, setSendingChannel] = useState<OtpChannel | null>(null)
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const from = (location.state as { from?: { pathname?: unknown; search?: unknown; hash?: unknown } } | null)?.from
  const destination =
    typeof from?.pathname === "string" && from.pathname.startsWith("/") && !from.pathname.startsWith("//")
      ? `${from.pathname}${typeof from.search === "string" ? from.search : ""}${typeof from.hash === "string" ? from.hash : ""}`
      : "/"

  useEffect(() => {
    if (otpCooldown <= 0) return
    const timer = setInterval(() => {
      setOtpCooldown((remaining) => Math.max(0, remaining - 1))
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [otpCooldown])

  async function handlePasswordSubmit() {
    setError(null)
    setPending(true)
    try {
      await auth.login({ kind: "password", username, password })
      queryClient.removeQueries({ queryKey: ME_QUERY_KEY })
      void navigate(destination, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  async function handleOtpLogin(channel: OtpChannel, target: string, code: string) {
    setError(null)
    setPending(true)
    try {
      await auth.login({ kind: "otp", channel, target: target.trim(), code })
      queryClient.removeQueries({ queryKey: ME_QUERY_KEY })
      void navigate(destination, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  async function handleSendOtp(channel: OtpChannel, target: string) {
    setError(null)
    const trimmed = target.trim()
    if (!trimmed) {
      setError(channel === "email" ? t("needEmail") : t("needPhone"))
      return
    }
    setSendingChannel(channel)
    try {
      await auth.sendOtp(channel, trimmed)
      setOtpCooldown(OTP_SEND_COOLDOWN_SECONDS)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSendingChannel(null)
    }
  }

  if (import.meta.env.VITE_AUTH_PROVIDER === "clerk") {
    // Clerk 托管登录：hash 路由（SPA 无需宿主路由集成），登录成功跳转 fallbackRedirectUrl
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-4">
        <SignIn routing="hash" fallbackRedirectUrl="/" />
      </main>
    )
  }

  return (
    <div className="relative grid min-h-svh lg:grid-cols-2">
      {/* 主题切换（登录页独立路由，无布局顶栏——右上角常驻切换入口） */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      {/* 品牌面板（lg 起显示）：与表单区同底色（整体随主题明暗一致），
          左右区分靠氛围装饰（前景低透明度光晕 + 网格线，均随主题） */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-background p-12 text-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_15%,color-mix(in_oklch,var(--foreground)_8%,transparent),transparent_55%),linear-gradient(to_right,color-mix(in_oklch,var(--foreground)_4%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--foreground)_4%,transparent)_1px,transparent_1px)] bg-size-[auto,32px_32px,32px_32px]"
        />
        <div className="relative flex items-center gap-3">
          {/* 字母 mark：与侧边栏一致的品牌渐变方块 + P（随主题） */}
          <div className="flex size-9 items-center justify-center rounded-lg bg-linear-to-br from-primary to-primary/70 text-primary-foreground">
            <span className="text-sm font-bold leading-none">{APP_NAME.charAt(0)}</span>
          </div>
          <div>
            <p className="text-sm font-semibold">{APP_NAME}</p>
          </div>
        </div>
        {/* 中央品牌水印（装饰性大字母，前景低透明度，随主题） */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex select-none items-center justify-center"
        >
          <span className="text-[12rem] font-bold leading-none text-foreground/5">{APP_NAME.charAt(0)}</span>
        </div>
        <p className="relative text-xs text-muted-foreground/60">© 2026 {APP_NAME}</p>
      </aside>

      {/* 表单区：小屏隐藏品牌面板，顶部补品牌 mark；lg 起为独立列 */}
      <main className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-center gap-2 lg:hidden">
            <div className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-primary to-primary/70 text-primary-foreground">
              <span className="text-sm font-bold leading-none">{APP_NAME.charAt(0)}</span>
            </div>
            <span className="text-sm font-semibold">{APP_NAME}</span>
          </div>
          {/* 标题区：品牌色渐变装饰条 + 渐变文字 + 渐入动效（克制但有设计感） */}
          <div className="mb-8 animate-in fade-in-0 slide-in-from-top-2 duration-500">
            <div
              aria-hidden
              className="mb-4 h-1 w-10 rounded-full bg-linear-to-r from-primary to-primary/30"
            />
            {/* 渐变应用整段（不拆分 span——拆分会让测试/文本查询无法匹配完整标题） */}
            <h1 className="bg-linear-to-r from-foreground via-foreground to-primary bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
              {t("heading")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          {error && (
            <p role="alert" className="mb-4 text-sm text-destructive">
              {error}
            </p>
          )}
          <Tabs defaultValue="password">
            <TabsList className="w-full">
              <TabsTrigger value="password">{t("accountTab")}</TabsTrigger>
              <TabsTrigger value="email">{t("emailTab")}</TabsTrigger>
              <TabsTrigger value="telephone">{t("phoneTab")}</TabsTrigger>
            </TabsList>
            <TabsContent value="password" className="py-5">
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handlePasswordSubmit()
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="login-username">{t("username")}</FieldLabel>
                    <FieldContent>
                      <Input
                        id="login-username"
                        value={username}
                        onChange={(event) => {
                          setUsername(event.target.value)
                        }}
                        placeholder={t("usernamePlaceholder")}
                        autoComplete="username"
                        className="h-10"
                      />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="login-password">{t("password")}</FieldLabel>
                    <FieldContent>
                      <Input
                        id="login-password"
                        type="password"
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value)
                        }}
                        placeholder={t("passwordPlaceholder")}
                        autoComplete="current-password"
                        className="h-10"
                      />
                    </FieldContent>
                  </Field>
                </FieldGroup>
                <Button type="submit" disabled={pending} className="h-10 w-full">
                  {pending ? (
                    <>
                      <Spinner /> {t("loggingIn")}
                    </>
                  ) : (
                    t("login")
                  )}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="email" className="py-5">
              <OtpLoginForm
                channel="email"
                cooldown={otpCooldown}
                sending={sendingChannel === "email"}
                pending={pending}
                onSend={(target) => {
                  void handleSendOtp("email", target)
                }}
                onLogin={(target, code) => {
                  void handleOtpLogin("email", target, code)
                }}
              />
            </TabsContent>
            <TabsContent value="telephone" className="py-5">
              <OtpLoginForm
                channel="telephone"
                cooldown={otpCooldown}
                sending={sendingChannel === "telephone"}
                pending={pending}
                onSend={(target) => {
                  void handleSendOtp("telephone", target)
                }}
                onLogin={(target, code) => {
                  void handleOtpLogin("telephone", target, code)
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}
