# Adding a module

Read `src/modules/events/` alongside this. It is the reference implementation and it is
deliberately small enough to hold in your head.

## The layers

```
HTTP request
     ↓
Controller (api/)          Thin. Validate → use case → map → return
     ↓
Application service        Orchestration, transaction boundary
     ↓
Domain                     Pure rules — no I/O
     ↓
Repository (infrastructure/)
     ↓
Prisma
     ↓
PostgreSQL
```

The test for each layer, asked in order:

- **Does it read or write anything outside the process?** → `infrastructure/`
- **Does it know about HTTP?** → `api/`
- **Is it a rule that would still be true on paper?** → `domain/`
- **Is it "do this, then that"?** → `application/`

## Step by step

1. **Create the module directory**

```bash
mkdir -p src/modules/<name>/{api/dto,application,domain,infrastructure,mappers}
```

Do not pre-create empty folders for every future module. Create them when you start
the work. Planned modules are listed in
[docs/architecture/overview.md](../architecture/overview.md).

2. **Add the API layer** — controller + DTOs (Zod schemas; prefer `@eventis/contracts`
   once the contract PR lands).
3. **Add application use cases** — one service file per use case when that keeps
   boundaries clear (see `create-event.service.ts`).
4. **Add domain objects** — pure types and rules. No Nest, no Prisma, no clock reads.
5. **Add the repository** — the only file that imports `PrismaService`.
6. **Add the mapper** — domain → API response / contract type.
7. **Add `<name>.module.ts` and `index.ts`** — export the module and use-case services
   only; never the repository.
8. **Add tests** — domain unit tests first; integration tests for the repository when
   the module persists data.
9. **Register the module** in `app.module.ts`.
10. **Verify**

```bash
bun run verify
```

## Architectural rules

- Controllers must remain thin.
- Business logic belongs in application / domain layers.
- Prisma belongs in infrastructure.
- Modules must not directly access another module's database implementation.
- Do not import internal implementation details from another module.
- Shared HTTP contracts belong in `@eventis/contracts`.
- External providers must be isolated behind infrastructure interfaces.
- Do not put secrets in source control.

## Before you open the PR

- [ ] Domain logic is pure, and tested without a database
- [ ] The repository is the only file importing Prisma
- [ ] Every response goes through a mapper
- [ ] Anything that checks-then-writes does it in one atomic statement
- [ ] `index.ts` exposes services and nothing from `infrastructure/`
- [ ] `bun run verify` passes
