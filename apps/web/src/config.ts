/**
 * 前端应用配置：系统品牌名等展示性配置集中管理。
 * 品牌名由环境变量 VITE_APP_NAME 提供（.env 或部署注入），**无内置默认值**——
 * 未配置时为空字符串（界面不显示品牌名）。测试环境在 test/setup.ts 中 stub。
 * index.html 的 <title> 使用 Vite 的 %VITE_APP_NAME% 模板替换。
 */
export const APP_NAME: string =
  (import.meta.env.VITE_APP_NAME as string | undefined) ?? ""
