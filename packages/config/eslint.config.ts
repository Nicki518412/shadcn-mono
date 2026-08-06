import js from "@eslint/js"
import tseslint from "typescript-eslint"

export const config = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "**/eslint.config.ts",
      // 生成物（openapi-typescript 输出；web 包 tsconfig 尚未存在，projectService 无法定位）
      "apps/web/src/api/schema.d.ts",
    ],
  },
)

export default config
