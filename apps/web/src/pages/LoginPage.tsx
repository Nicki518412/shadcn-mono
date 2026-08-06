import { useEffect, useState } from "react"
import { useNavigate } from "react-router"

import { useAuth } from "@/auth/AuthProvider"
import type { OtpChannel } from "@/auth/types"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/** 发送动态码后的冷却秒数 */
const OTP_SEND_COOLDOWN_SECONDS = 60

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "操作失败，请重试"
}

/**
 * 邮箱 / 手机动态码 Tab 表单（两个 Tab 结构一致，仅 channel 与文案不同）。
 * 输入状态在本地维护；面板随 Tab 切换卸载，切走再切回需重新输入（可接受）。
 */
function OtpLoginForm({
  channel,
  targetLabel,
  targetPlaceholder,
  cooldown,
  sending,
  pending,
  onSend,
  onLogin,
}: {
  channel: OtpChannel
  targetLabel: string
  targetPlaceholder: string
  cooldown: number
  sending: boolean
  pending: boolean
  onSend: (target: string) => void
  onLogin: (target: string, code: string) => void
}) {
  const [target, setTarget] = useState("")
  const [code, setCode] = useState("")

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
          <FieldLabel htmlFor={`login-otp-${channel}-target`}>{targetLabel}</FieldLabel>
          <FieldContent>
            <Input
              id={`login-otp-${channel}-target`}
              value={target}
              onChange={(event) => {
                setTarget(event.target.value)
              }}
              placeholder={targetPlaceholder}
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor={`login-otp-${channel}-code`}>动态码</FieldLabel>
          <FieldContent>
            <InputOTP
              id={`login-otp-${channel}-code`}
              maxLength={6}
              value={code}
              onChange={setCode}
              inputMode="numeric"
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((slotIndex) => (
                  <InputOTPSlot key={slotIndex} index={slotIndex} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </FieldContent>
        </Field>
      </FieldGroup>
      <Button
        type="button"
        variant="outline"
        disabled={cooldown > 0 || sending}
        onClick={() => {
          onSend(target)
        }}
      >
        {cooldown > 0 ? (
          `重新发送（${String(cooldown)}s）`
        ) : sending ? (
          <>
            <Spinner /> 发送中…
          </>
        ) : (
          "发送验证码"
        )}
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <Spinner /> 登录中…
          </>
        ) : (
          "登录"
        )}
      </Button>
    </form>
  )
}

export default function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sendingChannel, setSendingChannel] = useState<OtpChannel | null>(null)
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

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
      void navigate("/")
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
      void navigate("/")
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
      setError(channel === "email" ? "请输入邮箱地址" : "请输入手机号")
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
    // Task 24：替换为 Clerk 的 <SignIn /> 托管登录组件
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        Cloak SignIn 占位（Task 24）
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>管理后台登录</CardTitle>
          <CardDescription>开发模式：验证码打印在 api 控制台（DevOtpSender）</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Tabs defaultValue="password">
            <TabsList className="w-full">
              <TabsTrigger value="password">账号密码</TabsTrigger>
              <TabsTrigger value="email">邮箱动态码</TabsTrigger>
              <TabsTrigger value="telephone">手机动态码</TabsTrigger>
            </TabsList>
            <TabsContent value="password" className="pt-4">
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handlePasswordSubmit()
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="login-username">用户名</FieldLabel>
                    <FieldContent>
                      <Input
                        id="login-username"
                        value={username}
                        onChange={(event) => {
                          setUsername(event.target.value)
                        }}
                        placeholder="用户名"
                        autoComplete="username"
                      />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="login-password">密码</FieldLabel>
                    <FieldContent>
                      <Input
                        id="login-password"
                        type="password"
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value)
                        }}
                        placeholder="密码"
                        autoComplete="current-password"
                      />
                    </FieldContent>
                  </Field>
                </FieldGroup>
                <Button type="submit" disabled={pending}>
                  {pending ? (
                    <>
                      <Spinner /> 登录中…
                    </>
                  ) : (
                    "登录"
                  )}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="email" className="pt-4">
              <OtpLoginForm
                channel="email"
                targetLabel="邮箱"
                targetPlaceholder="name@example.com"
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
            <TabsContent value="telephone" className="pt-4">
              <OtpLoginForm
                channel="telephone"
                targetLabel="手机号"
                targetPlaceholder="13800138000"
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
        </CardContent>
      </Card>
    </main>
  )
}
