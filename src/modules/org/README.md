# org

Organizers, the verification workflow, staff membership.

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

Backend: Identity & Org · Off limits: `payments`, `ledger`
