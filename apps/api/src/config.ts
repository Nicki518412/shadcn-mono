export interface AppConfig {
  databaseUrl: string
  jwtSecret: string
  authProvider: "local" | "clerk"
  port: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const provider = env.AUTH_PROVIDER ?? "local"
  if (provider !== "local" && provider !== "clerk") {
    throw new Error(`AUTH_PROVIDER 仅支持 local/clerk，收到: ${provider}`)
  }
  const jwtSecret = env.JWT_SECRET ?? "dev-secret-change-me"
  const port = Number(env.PORT ?? 3001)
  // Prisma 相对路径按 schema 所在目录（packages/db/prisma/）解析，故用 ../../../ 回到仓库根
  return {
    databaseUrl: env.DATABASE_URL ?? "file:../../../packages/db/prisma/dev.db",
    jwtSecret,
    authProvider: provider,
    port,
  }
}
