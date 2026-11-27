import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const config = [
  {
    ignores: ["coverage/**", ".next/**", "node_modules/**", "shothik-verification/**"],
  },
  ...compat.extends("next/core-web-vitals"),
];

export default config;
