# notification

Push, SMS and email delivery. Every consumer is idempotent — outbox delivery is at-least-once.

**Status:** not implemented. The layer directories exist so the first PR has an
obvious shape to fill in — see [adding a module](../../../docs/guides/adding-a-module.md).

## Layout

| Layer | Directory | May import |
|---|---|---|
| Transport | `api/` | `application/` |
| Use cases | `application/` | `domain/`, `infrastructure/` |
| Business rules | `domain/` | **nothing** |
| Persistence | `infrastructure/` | `domain/`, the database |
| Mapping | `mappers/` | `domain/`, `@eventis/contracts` |

Everything this module exposes goes through `index.ts`. Nothing else leaves.

## Owner

Backend: Commerce · Off limits: `payments`, `ledger`
