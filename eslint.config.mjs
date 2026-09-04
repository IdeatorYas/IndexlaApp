import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "artifacts/**",
      "cache/**",
      "typechain-types/**",
      "hardhat.config.cjs",
      "test/stable-club/**",
      "scripts/stable-club/**",
      "scripts/ensure-wagmi2-connectors.cjs",
      "tests/e2e/stable-club-global-setup.cjs",
      "tests/e2e/stable-club-global-teardown.cjs",
      "tmp/**",
    ],
  },
  {
    files: [
      "tests/e2e/stable-club-harness-process.cjs",
      "tests/e2e/start-stable-club-webserver.cjs",
      "tests/e2e/verify-stable-club-cleanup.cjs",
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
