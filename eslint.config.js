import nest from "./config/eslint/nest.config.js";

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
