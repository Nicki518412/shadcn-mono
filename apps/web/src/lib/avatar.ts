import { API_BASE } from "@/api/session"

/** 头像访问 URL（avatar 存服务端文件名，经 /api/files 鉴权访问；null → 空字符串由调用方兜底） */
export function avatarUrl(avatar: string | null): string | null {
  return avatar ? `${API_BASE}/files/${avatar}` : null
}
