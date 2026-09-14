# Adding a module

Read `src/modules/catalog/` alongside this. It is the reference implementation and it is
deliberately small enough to hold in your head.

## The layers, and what decides where code goes

```
      HTTP request
           │
           ▼
  ┌─────────────────┐   api/            Thin. Validate, call the service, map, return.
  │   TRANSPORT     │                   No decisions. No database. No business rules.
  └────────┬────────┘
           ▼
  ┌─────────────────┐   application/    Orchestration. Calls repositories, applies
  │   USE CASES     │                   domain rules, owns the transaction boundary.
  └───┬─────────┬───┘                   Knows nothing about HTTP.
      ▼         ▼
┌──────────┐ ┌────────────────┐
│  DOMAIN  │ │ INFRASTRUCTURE │  domain/          Pure. No I/O, no framework, no clock.
│  rules   │ │  persistence   │  infrastructure/  The only place Drizzle is imported.
└──────────┘ └────────────────┘
```

The test for each layer, asked in order:

- **Does it read or write anything outside the process?** → `infrastructure/`
- **Does it know about HTTP — status codes, headers, the request object?** → `api/`
- **Is it a rule that would still be true on paper, with no computer?** → `domain/`
- **Is it "do this, then that, and if it fails undo the first"?** → `application/`

If you cannot place something, it is usually doing two things. Split it.

## Step by step

### 1. Directories

```bash
mkdir -p src/modules/<name>/{api/dto,application,domain,infrastructure,mappers}
```

The skeletons already exist for all eleven modules. Fill yours in.

### 2. The contract first

Before any implementation, add the schemas to `@eventis/contracts` and open that PR.
Once merged and released, the web and mobile developers can build against typed mocks
while you are still writing the service. That is the whole point of contract-first — it
is what stops four people blocking on one.

### 3. Domain — start here, not at the controller

Pure functions and types. No `@Injectable`, no imports from anywhere else in the module.

```ts
// domain/order.entity.ts
export function canBeCancelled(order: Order, now: Date): boolean {
  return order.status === 'awaiting_payment' && order.expiresAt > now;
}
```

Note `now` is a **parameter**. Domain code never reads the clock — ESLint bans
`new Date()` outside `common/clock.ts` so that this rule cannot quietly decay.

Write the tests here first. Domain tests need no database, no mocks and no fixtures,
which is why they are the tests that will still be passing in a year.

### 4. Infrastructure — the repository

The only file in your module that imports Drizzle. It takes and returns **domain**
types, never rows.

```ts
@Injectable()
export class OrderRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findById(id: string): Promise<Order | null> {
    const [row] = await this.db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }
}
```

**The concurrency rule.** Anything that checks a condition and then writes must do both
in one statement. This looks correct in review and is not:

```ts
// BROKEN. Two concurrent requests both read 99 and both write 100 for the last 2 tickets.
const tt = await db.query.ticketTypes.findFirst({ where: eq(ticketTypes.id, id) });
if (tt.quantitySold + qty <= tt.quantityTotal) {
  await db.update(ticketTypes).set({ quantitySold: tt.quantitySold + qty })...
}
```

This is correct and needs no lock:

```ts
const result = await db.update(ticketTypes)
  .set({ quantitySold: sql`${ticketTypes.quantitySold} + ${qty}` })
  .where(and(
    eq(ticketTypes.id, ticketTypeId),
    sql`${ticketTypes.quantitySold} <= ${ticketTypes.quantityTotal} - ${qty}`,
  ))
  .returning({ id: ticketTypes.id });
return result.length === 1;   // 0 means sold out
```

Postgres evaluates the condition and the increment atomically. A
`CHECK (quantity_sold <= quantity_total)` constraint is the backstop that turns a logic
bug into a database error instead of a refund.

### 5. Application — the service

```ts
@Injectable()
export class CommerceService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly catalog: CatalogService,   // another module, via its index.ts
    private readonly clock: Clock,
  ) {}
}
```

Depend on other modules through their **service**, imported from their `index.ts`.
Never import their repository. dependency-cruiser fails the build if you do.

### 6. Mapper

```ts
export function toOrderContract(order: Order): OrderContract { ... }
```

The return type annotation is the enforcement. Never return a row, and never return a
domain object directly — an internal field added later would ship to every client.

### 7. Controller

```ts
@Controller({ path: 'orders', version: '1' })
export class OrderController {
  @Post()
  async create(
    @Body(zodPipe(createOrderRequest)) body: CreateOrderRequest,
  ): Promise<OrderContract> {
    return toOrderContract(await this.commerce.createOrder(body));
  }
}
```

### 8. Module and public surface

```ts
// <name>.module.ts
@Module({
  controllers: [OrderController],
  providers: [CommerceService, OrderRepository],
  exports: [CommerceService],       // the repository stays private
})
export class CommerceModule {}
```

```ts
// index.ts — nothing else leaves
export { CommerceModule } from './commerce.module.js';
export { CommerceService } from './application/commerce.service.js';
export type { Order } from './domain/order.entity.js';
```

### 9. Register it in `app.module.ts`, and verify

```bash
bun run verify
```

## Before you open the PR

- [ ] Domain logic is pure, and tested without a database
- [ ] The repository is the only file importing Drizzle
- [ ] Every response goes through a mapper returning a contract type
- [ ] Anything that checks-then-writes does it in one atomic statement
- [ ] `index.ts` exposes the service and nothing else
- [ ] Any endpoint that creates something is idempotent
- [ ] Authorization is tested: can user A read user B's row?
- [ ] `bun run verify` passes
