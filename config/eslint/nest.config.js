import base from './base.config.js';

/**
 * NestJS API. Adds the money rules and the layering rules that dependency-cruiser
 * cannot express at the expression level.
 */
export default [
  ...base,
  {
    rules: {
      // Decorators legitimately need parameter properties and empty constructors
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-function': ['error', { allow: ['constructors'] }],
    },
  },
  {
    // Money is bigint minor units. Floating point is how you lose real cash.
    files: ['src/modules/payments/**/*.ts', 'src/modules/ledger/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Money is bigint minor units. parseFloat is banned here.' },
        {
          name: 'parseInt',
          message: 'Use BigInt(value) after validating the string. parseInt is banned here.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='Number']",
          message: 'Money is bigint minor units. Number() is banned in payments and ledger.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Inject a Clock. Payment and ledger timestamps must be deterministic in tests.',
        },
        {
          selector: "BinaryExpression[operator='/'][left.typeAnnotation]",
          message:
            'Division on money must be explicit and rounded deliberately. Use the Money helpers.',
        },
      ],
    },
  },
  {
    // The domain layer is pure. If it can reach infrastructure, it is not a domain layer.
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**'],
              message: 'domain must not import infrastructure. It is pure.',
            },
            { group: ['**/api/**'], message: 'domain must not import the transport layer.' },
            {
              group: ['drizzle-orm', 'drizzle-orm/*', '@nestjs/*', 'bullmq', 'ioredis'],
              message:
                'domain has no I/O and no framework. Move this to application or infrastructure.',
            },
          ],
        },
      ],
    },
  },
  {
    // Controllers are thin. They must not reach the database.
    files: ['src/modules/*/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**'],
              message: 'Controllers call services, never repositories.',
            },
            {
              group: ['drizzle-orm', 'drizzle-orm/*'],
              message: 'No database access in the transport layer.',
            },
          ],
        },
      ],
    },
  },
];
