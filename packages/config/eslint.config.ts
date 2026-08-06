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
      // 生成物（openapi-typescript 输出，永久 ignore——Task 15 web 包建 tsconfig 后仍需保留）
      "apps/web/src/api/schema.d.ts",
    ],
  },
)

export default config
