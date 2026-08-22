import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "apps/web/dist/**",
      "apps/site/dist/**",
      ".vercel/**",
      "firmware/**",
      "scripts/**/*.mjs",
      "scripts/migrate-*.ts",
      "scripts/migrate-*.mjs",
      "docs/archive/prototypes-web/**",
      "apps/web/src/components/domain-heroes/vendor/**",
      "SCRATCH/**",
      ".agentstack/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/scenes/*/**"],
              message:
                "Import Domain Packs via domain-packs loader or @embodied-agent/domain-* packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/domain-packs/**", "scripts/lib/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },

  {
    files: ["packages/core/src/schemas/**", "scenes/**/schemas/**", "apps/web/**", "apps/site/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "prefer-const": "warn",
    },
  },
  // 预防性规则：禁止在 scenes 与 agent intent 理解层测试中用 vi.mock mock LLM 模块。
  // 理解层只用真实 LLM（AGENTS.md 测试原则）。豁免 llm.test.ts（测 repair/unavailable 编排）。
  // apps/api/src/nlg/** 不在此 scope，自然豁免（NLG 渲染层非理解层）。
  {
    files: ["scenes/**/*.test.ts", "packages/agent/src/intent/**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='vi'][callee.property.name='mock'] > Literal[value=/llm/i]",
          message:
            "禁止在 scenes/agent intent 测试中用 vi.mock mock LLM 模块（理解层只用真实 LLM）。如需测 repair/unavailable 编排，见 packages/agent/src/intent/llm.test.ts 豁免。",
        },
        {
          selector:
            "CallExpression[callee.object.name='vi'][callee.property.name='mock'] > TemplateElement[value.raw=/llm/i]",
          message:
            "禁止在 scenes/agent intent 测试中用 vi.mock mock LLM 模块（理解层只用真实 LLM）。如需测 repair/unavailable 编排，见 packages/agent/src/intent/llm.test.ts 豁免。",
        },
      ],
    },
  },
  {
    files: ["packages/agent/src/intent/llm.test.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  {
    files: ["tests/e2e/**/*.ts"],
    rules: {
      // Playwright fixture 签名常含未解构使用的占位参数（如 { page, context } 只取其一）。
      "no-empty-pattern": "off",
    },
  },
);
