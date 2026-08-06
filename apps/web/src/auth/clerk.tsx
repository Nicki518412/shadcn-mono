import { ClerkProvider } from "@clerk/clerk-react"
import type { JSX, ReactNode } from "react"

import { ClerkSessionAdapter } from "./ClerkAuthProvider"

/** Clerk 认证外壳：ClerkProvider（publishableKey 取 VITE_CLERK_PUBLISHABLE_KEY）+ 会话桥接组件 */
export function ClerkAuthShell({ children }: { children: ReactNode }): JSX.Element {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
  if (!publishableKey) {
    throw new Error("VITE_CLERK_PUBLISHABLE_KEY 未配置（VITE_AUTH_PROVIDER=clerk 时必须）")
  }
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkSessionAdapter>{children}</ClerkSessionAdapter>
    </ClerkProvider>
  )
}
