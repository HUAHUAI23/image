import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import eslintConfigPrettier from "eslint-config-prettier"
import simpleImportSort from "eslint-plugin-simple-import-sort"

const eslintConfig = defineConfig([
  // Next.js recommended rules
  ...nextVitals,
  ...nextTs,

  // Custom plugins and rules
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      // Simple import sort rules
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            // React and external packages
            ["^react", "^@?\\w"],
            // Internal packages
            ["^(@|components)(/.*|$)"],
            // Side effect imports
            ["^\\u0000"],
            // Parent imports
            ["^\\.\\.(?!/?$)", "^\\.\\./?$"],
            // Other relative imports
            ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
            // Style imports
            ["^.+\\.?(css)$"],
          ],
        },
      ],
      "simple-import-sort/exports": "error",

      // TypeScript rule adjustments
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // React hooks rules adjustments
      "react-hooks/set-state-in-effect": "warn", // Downgrade from error to warning
    },
  },

  // Prettier config should be last to override conflicting rules
  eslintConfigPrettier,

  // Global ignores
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "components/ui/**",
    "components/animate-ui/**",
  ]),
])

export default eslintConfig