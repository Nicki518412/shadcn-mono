export interface AppConfig {
  databaseUrl: string
  jwtSecret: string
  authProvider: "local" | "clerk"
  port: number
  uploadDir: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const provider = env.AUTH_PROVIDER ?? "local"
  if (provider !== "local" && provider !== "clerk") {
    throw new Error(`AUTH_PROVIDER 仅支持 local/clerk，收到: ${provider}`)
  }
  const jwtSecret = env.JWT_SECRET ?? "dev-secret-change-me"
  if (
    provider === "local" &&
    env.NODE_ENV === "production" &&
    (jwtSecret === "dev-secret-change-me" || jwtSecret.length < 32)
  ) {
    throw new Error("生产环境 JWT_SECRET 必须配置为至少 32 个字符的随机密钥")
  }
  const port = Number(env.PORT ?? 3001)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT 必须是 1-65535 的整数，收到: ${String(env.PORT ?? 3001)}`)
  }
  // Prisma 相对路径按 schema 所在目录（packages/db/prisma/）解析，故用 ../../../ 回到仓库根
  return {
    databaseUrl: env.DATABASE_URL ?? "file:../../../packages/db/prisma/dev.db",
    jwtSecret,
    authProvider: provider,
    port,
    // 上传目录（相对 cwd=apps/api；容器部署经环境变量指到卷挂载点）
    uploadDir: env.UPLOAD_DIR ?? "./uploads",
  }
}
