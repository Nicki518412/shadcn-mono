// 请求体快照脱敏：键名包含敏感词（password/token/secret/code）的值替换为 ***
// 操作日志落库前调用，防止审计日志留存明文密码/令牌/验证码

const SENSITIVE_KEYS = ["password", "token", "secret", "code"]

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue)
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const sensitive = SENSITIVE_KEYS.some((word) => key.toLowerCase().includes(word))
      out[key] = sensitive ? "***" : redactValue(item)
    }
    return out
  }
  return value
}

/** 解析 JSON 后脱敏再序列化；非 JSON 原样返回（截断在调用侧） */
export function redactJson(text: string): string {
  try {
    return JSON.stringify(redactValue(JSON.parse(text)))
  } catch {
    return text
  }
}
