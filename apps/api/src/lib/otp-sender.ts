export interface OtpSender {
  sendEmail(to: string, code: string): Promise<void>
  sendSms(to: string, code: string): Promise<void>
}

const devCodes = new Map<string, string>()

function codeKey(channel: "email" | "telephone", target: string): string {
  return `${channel}:${target.toLowerCase()}`
}

/** 测试辅助：读取 DevOtpSender 最近一次发送的验证码。验证码只留在当前开发进程内，不写数据库。 */
export function getDevOtpCode(channel: "email" | "telephone", target: string): string | null {
  return devCodes.get(codeKey(channel, target)) ?? null
}

/** 开发实现：验证码仅输出到开发控制台并保存在进程内，禁止在生产环境启用。 */
export class DevOtpSender implements OtpSender {
  sendEmail(to: string, code: string): Promise<void> {
    console.log(`[DevOtpSender] EMAIL → ${to}: 验证码 ${code}（5 分钟内有效）`)
    devCodes.set(codeKey("email", to), code)
    return Promise.resolve()
  }
  sendSms(to: string, code: string): Promise<void> {
    console.log(`[DevOtpSender] SMS → ${to}: 验证码 ${code}（5 分钟内有效）`)
    devCodes.set(codeKey("telephone", to), code)
    return Promise.resolve()
  }
}

class UnconfiguredOtpSender implements OtpSender {
  sendEmail(): Promise<void> {
    return Promise.reject(new Error("生产环境尚未配置邮件 OTP Sender"))
  }
  sendSms(): Promise<void> {
    return Promise.reject(new Error("生产环境尚未配置短信 OTP Sender"))
  }
}

export const otpSender: OtpSender =
  process.env.NODE_ENV === "production" ? new UnconfiguredOtpSender() : new DevOtpSender()
