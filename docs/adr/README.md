# Architecture decision records

This repository is the **architecture home** for Eventis. Cross-repository decisions
are recorded here and linked from the other repositories.

One page per significant decision: context, options, decision, consequences. Write one
whenever a choice will be expensive to reverse or hard to reconstruct — so that in
month six nobody has to reverse-engineer why Drizzle and not Prisma.

| # | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | A modular monolith, not microservices | Accepted |
| [0002](0002-nestjs-with-fastify.md) | NestJS on the Fastify adapter | Accepted |
| [0003](0003-drizzle-over-prisma.md) | Drizzle over Prisma | Accepted |
| [0004](0004-rest-with-shared-zod-over-trpc.md) | REST with shared Zod schemas, not tRPC | Accepted |
| [0005](0005-double-entry-ledger.md) | A double-entry ledger, not a balance column | Accepted |
| [0006](0006-phone-first-auth.md) | Phone-first authentication with OTP | Accepted |
| [0007](0007-outbox-for-external-effects.md) | A transactional outbox for external effects | Accepted |
| [0008](0008-offline-capable-signed-qr.md) | Offline-verifiable signed QR tickets | Accepted |

Decisions about the shared packages live in
[`Eventis-contracts/docs/adr`](https://github.com/Eventis-Rw/Eventis-contracts/tree/main/docs/adr):
publishing to npm, the Bun toolchain, the TypeScript version, and money as bigint.
