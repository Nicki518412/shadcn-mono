// 接口契约要求 Promise<void>（真实通道为异步 IO）；开发实现仅打印无 await，故禁用 require-await
/* eslint-disable @typescript-eslint/require-await */
export interface OtpSender {
  sendEmail(to: string, code: string): Promise<void>
  sendSms(to: string, code: string): Promise<void>
}

/** 开发实现：仅打印到控制台。接入真实短信/邮件通道时替换此实现（见 README）。 */
export class DevOtpSender implements OtpSender {
  async sendEmail(to: string, code: string): Promise<void> {
    console.log(`[DevOtpSender] EMAIL → ${to}: 验证码 ${code}（5 分钟内有效）`)
  }
  async sendSms(to: string, code: string): Promise<void> {
    console.log(`[DevOtpSender] SMS → ${to}: 验证码 ${code}（5 分钟内有效）`)
  }
}

export const otpSender: OtpSender = new DevOtpSender()
