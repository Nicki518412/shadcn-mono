// 容器首次启动初始化：User 表为空（全新库）才跑种子，避免重复初始化重置 admin 密码与演示数据
// 数据库结构由部署入口先执行 `prisma db push`（幂等），本脚本只负责数据初始化
import { prisma } from "./client.js"
import { runSeed } from "./seed.js"

const userCount = await prisma.user.count()
if (userCount === 0) {
  console.log("[init] 空库首次初始化：执行种子（admin / Admin@123）")
  await runSeed()
} else {
  console.log(`[init] 用户表已有 ${String(userCount)} 条数据，跳过种子（避免重置密码）`)
}
await prisma.$disconnect()
