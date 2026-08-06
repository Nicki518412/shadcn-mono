import { prisma } from "@repo/db"

export interface OtpSender {
  sendEmail(to: string, code: string): Promise<void>
  sendSms(to: string, code: string): Promise<void>
}

/** 开发实现：打印到控制台，并把明文回写到 devPlainCode（测试明文通道）。接入真实短信/邮件通道时替换此实现（见 README）。 */
export class DevOtpSender implements OtpSender {
  async sendEmail(to: string, code: string): Promise<void> {
    console.log(`[DevOtpSender] EMAIL → ${to}: 验证码 ${code}（5 分钟内有效）`)
    await recordPlainCode(to, code)
  }
  async sendSms(to: string, code: string): Promise<void> {
    console.log(`[DevOtpSender] SMS → ${to}: 验证码 ${code}（5 分钟内有效）`)
    await recordPlainCode(to, code)
  }
}

/** 明文回写刚创建的验证码记录（60 秒窗口内同 target 的最新记录；真实发送实现不包含此逻辑） */
async function recordPlainCode(target: string, code: string): Promise<void> {
  await prisma.otpCode.updateMany({
    where: { target, createdAt: { gte: new Date(Date.now() - 60_000) } },
    data: { devPlainCode: code },
  })
}

export const otpSender: OtpSender = new DevOtpSender()
