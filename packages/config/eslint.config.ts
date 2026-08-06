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
  { ignores: ["dist/**", "node_modules/**", "**/eslint.config.ts"] },
)

export default config
