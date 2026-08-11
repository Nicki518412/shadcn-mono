// 定时清理任务：过期/已吊销的 RefreshToken 与过期/已消费的 OtpCode
// 惰性清理仅覆盖用户操作路径，长时间不活跃的表会产生陈旧行——后台任务兜底收敛
import { prisma } from "@repo/db"

/** 清理间隔（毫秒）：默认每小时 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

/** 执行一次清理（导出便于集成测试直接调用；调度器仅控制执行时机） */
export async function runCleanup(): Promise<void> {
  const now = new Date()
  const [refreshTokens, otpCodes] = await Promise.all([
    prisma.refreshToken.deleteMany({
      where: { OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: now } }] },
    }),
    prisma.otpCode.deleteMany({
      where: { OR: [{ consumedAt: { not: null } }, { expiresAt: { lt: now } }] },
    }),
  ])
  console.log(
    `[scheduler] 清理完成: refreshToken ${String(refreshTokens.count)} 条 / otpCode ${String(otpCodes.count)} 条`,
  )
}

/**
 * 启动定时清理（仅生产/开发 serve 进程调用；测试环境经 createApp 不启动）。
 * setInterval 的 unref 让进程在无其他任务时可正常退出（守护进程模式仍由外部管理生命周期）。
 */
export function startCleanupScheduler(): NodeJS.Timeout {
  void runCleanup().catch((err: unknown) => {
    console.error("[scheduler] 清理失败:", err instanceof Error ? err.message : String(err))
  })
  return setInterval(() => {
    void runCleanup().catch((err: unknown) => {
      console.error("[scheduler] 清理失败:", err instanceof Error ? err.message : String(err))
    })
  }, CLEANUP_INTERVAL_MS).unref()
}
