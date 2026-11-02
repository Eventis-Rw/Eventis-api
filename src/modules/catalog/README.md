# catalog

Owns events, categories, venues, ticket types and the media pipeline.

**Status:** reference implementation only. `categories` is fully built as the worked
example of the layering; events, venues and ticket types land in Sprint 2.

## Public surface

```ts
import { CatalogService } from '@/modules/catalog';

catalogService.listCategories();
catalogService.getCategoryBySlug(slug);
```

Everything else is private. `commerce` will call `catalogService.getPublishableEvent(id)`;
it will never touch the `events` table.

## Layout

| Layer | Directory | May import |
|---|---|---|
| Transport | `api/` | `application/` |
| Use cases | `application/` | `domain/`, `infrastructure/` |
| Business rules | `domain/` | **nothing** |
| Persistence | `infrastructure/` | `domain/`, the database |
| Mapping | `mappers/` | `domain/`, `@eventis/contracts` |

## Owner

Backend: Catalog. Off limits: `payments`, `ledger`.
