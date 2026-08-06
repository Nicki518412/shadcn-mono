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
      // shadcn CLI 管理的产物（ui 组件与随装 use-mobile hook 均为官方 registry 源码，禁止手写修改；
      // 官方产物与 strictTypeChecked 风格规则存在已知偏差，参照 schema.d.ts 生成物先例永久 ignore；
      // ignore 面精确等于 CLI 管理面——components/business/ 等手写代码将被正常 lint）
      "apps/web/src/components/ui/**",
      "apps/web/src/hooks/use-mobile.ts",
    ],
  },
)

export default config
