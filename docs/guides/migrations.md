# Migrations

Prisma owns the schema (`prisma/schema.prisma`) and the migration history
(`prisma/migrations/`). Migrations are SQL files you own and can edit — that is
required for PostGIS, triggers and concurrent indexes (ADR 0009).

```bash
# After changing schema.prisma — create a named migration (interactive):
bunx prisma migrate dev --name <short_description>

# Apply pending migrations (CI / production / local after pull):
bun run db:migrate

# Validate the schema without applying:
bunx prisma validate

# Explore data:
bun run db:studio
```

## The rules

**One migration per PR.** Two migrations in one PR cannot be rolled back independently
and cannot be reviewed properly.

**Forward-only in production.** There is no `down`. Fixing a bad migration means
writing a new one.

**`CREATE INDEX CONCURRENTLY` on any populated table.** A plain `CREATE INDEX` takes an
`ACCESS EXCLUSIVE` lock. Edit the generated SQL by hand and put `CONCURRENTLY` in its
own migration file with no other statement — it cannot run inside a transaction block.

**Read the generated SQL before committing it.** A rename looks identical to a drop
plus an add. That is data loss if nobody reads the file.

## Changing a column safely: expand and contract

Never rename or retype in place on a populated table. Spread it across deploys:

```
1. ADD        add the new column, nullable. Deploy.
2. DUAL-WRITE write both columns. Deploy.
3. BACKFILL   fill the new column in batches.
4. SWITCH     read from the new column. Deploy.
5. STOP       stop writing the old one. Deploy.
6. DROP       drop the old column. Deploy.
```

## Things Prisma cannot express — write SQL by hand

Document each escape hatch in the migration file and in the PR:

| Feature                                | Why                                  | Approach                                   |
| -------------------------------------- | ------------------------------------ | ------------------------------------------ |
| `CREATE EXTENSION postgis` / `pg_trgm` | Required before dependent objects    | Initial migration + `extensions` in schema |
| `geography(Point, 4326)`               | Discovery distance queries in metres | SQL + Prisma `Unsupported` if mapped       |
| GiST index on geography                | `ST_DWithin` performance             | Hand-written `CREATE INDEX`                |
| Deferred sum-to-zero ledger trigger    | Double-entry invariant               | Hand-written trigger SQL                   |
| Append-only `ledger_entries`           | Audit integrity                      | Trigger / revoke UPDATE/DELETE             |
| Generated `tsvector`                   | Full-text search                     | Generated column + GIN index               |
| Partial indexes                        | Outbox unpublished poller            | Hand-written `WHERE` predicate             |

Do **not** invent a fake typed Prisma field that pretends to be PostGIS geography.
Call `$queryRaw` (or a typed helper) from the discovery repository and keep the SQL
reviewable.

## Before merging

- [ ] I read the generated SQL line by line
- [ ] No rename was generated as a drop plus an add
- [ ] Any index on a populated table is `CONCURRENTLY`, alone in its file
- [ ] `bunx prisma validate` passes
- [ ] It applies cleanly to an **empty** database (CI checks this)
- [ ] It applies cleanly to a **copy of staging** (you check this)
