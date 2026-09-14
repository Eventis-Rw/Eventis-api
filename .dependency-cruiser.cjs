/**
 * The module boundaries of the Eventis modular monolith.
 *
 * TypeScript will happily let `catalog` import from `commerce`, and nothing else
 * stops it. Without this file the modular monolith is gone by week six and what
 * remains is a monolith with directories.
 *
 * Every rule here has a matching negative test in scripts/verify-boundaries.sh,
 * which writes a deliberate violation and asserts the rule fails. A rule nobody has
 * watched fail is a comment, not a rule.
 */
module.exports = {
  forbidden: [
    {
      name: 'not-to-unresolvable',
      comment: 'An import that does not resolve is a typo or a missing dependency.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },

    // ---------- between modules ----------
    {
      name: 'no-deep-module-imports',
      comment:
        'Modules talk through their exported index.ts, never through internals. Call the service; do not reach for the repository.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/.+',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'ledger-is-restricted',
      comment:
        'Only payments and commerce may reach the ledger. A module that can write entries is a module that can lose money.',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/',
        pathNot: '^src/modules/(ledger|payments|commerce)/',
      },
      to: { path: '^src/modules/ledger/' },
    },

    // ---------- inside a module: the layers ----------
    {
      name: 'domain-is-pure',
      comment:
        'The domain layer has no I/O and no framework. If it needs a repository, the logic belongs in application/.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/domain/' },
      to: {
        path: [
          '^src/modules/[^/]+/(api|application|infrastructure)/',
          '^src/infra/',
          'node_modules/(drizzle-orm|postgres|@nestjs|bullmq|ioredis|pino)(/|$)',
        ],
      },
    },
    {
      name: 'transport-does-not-touch-the-database',
      comment:
        'Controllers call services, never repositories. A controller that queries is logic that cannot be reused by a worker.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/api/' },
      to: {
        path: [
          '^src/modules/[^/]+/infrastructure/',
          '^src/infra/database/',
          'node_modules/drizzle-orm(/|$)',
        ],
      },
    },
    {
      name: 'persistence-does-not-call-back-up',
      comment: 'A repository that imports its service is a cycle wearing a disguise.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/infrastructure/' },
      to: { path: '^src/modules/[^/]+/(api|application)/' },
    },
    {
      name: 'mappers-do-no-io',
      comment: 'A mapper turns a domain object into a contract type. Nothing else.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/mappers/' },
      to: {
        path: [
          '^src/modules/[^/]+/(api|infrastructure)/',
          '^src/infra/',
          'node_modules/(drizzle-orm|postgres)(/|$)',
        ],
      },
    },

    // ---------- runtime isolation ----------
    {
      name: 'no-circular',
      comment: 'A cycle means the boundary between two things is not real.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: ['\\.d\\.ts$', 'index\\.ts$', '(main|worker|migrate)\\.ts$', '\\.gitkeep$'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    exclude: { path: '\\.test\\.ts$' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
