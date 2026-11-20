import nest from "@eventis/eslint-config/nest";

export default [
  {
    ignores: [
      ".kilo/**",
      "dist/**",
      "prisma/migrations/**",
      "coverage/**",
      "*.config.js",
      "eslint.config.js",
    ],
  },
  ...nest,
];
