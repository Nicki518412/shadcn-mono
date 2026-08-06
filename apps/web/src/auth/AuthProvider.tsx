import { createContext, useContext } from "react"
import type { JSX, ReactNode } from "react"
import type { AuthProvider } from "./types"

export const AuthContext = createContext<AuthProvider | null>(null)

export function useAuth(): AuthProvider {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用")
  return ctx
}

export function AuthProviderView({
  provider,
  children,
}: {
  provider: AuthProvider
  children: ReactNode
}): JSX.Element {
  return <AuthContext.Provider value={provider}>{children}</AuthContext.Provider>
}
