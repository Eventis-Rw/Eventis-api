import nest from '@eventis/eslint-config/nest';

export default [
  { ignores: ['dist/**', 'drizzle/**', 'coverage/**', '*.config.js', 'eslint.config.js'] },
  ...nest,
];
