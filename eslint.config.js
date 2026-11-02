import nest from "@eventis/eslint-config/nest";

export default [
  {
    ignores: [
      "dist/**",
      "prisma/migrations/**",
      "coverage/**",
      "*.config.js",
      "eslint.config.js",
    ],
  },
  ...nest,
];
