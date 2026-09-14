# payments

Provider abstraction, payment intents, webhooks, settlement. The MoMo or aggregator SDK is imported in `infrastructure/providers/` and nowhere else.

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

Tech lead only · Off limits: interns do not own this module
