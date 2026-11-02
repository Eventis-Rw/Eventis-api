# Migrations

Drizzle generates plain SQL files that we own and can edit. That is why it was chosen
(ADR 0003) and it means you are responsible for reading what was generated.

```bash
bun run db:generate      # generate SQL from the schema change
# READ the generated file in drizzle/. Edit it if needed.
bun run db:migrate       # apply locally
bun run db:check         # migrations still consistent with the schema
```

## The rules

**One migration per PR.** Two migrations in one PR cannot be rolled back independently
and cannot be reviewed properly.

**Forward-only in production.** There is no `down`. Fixing a bad migration means
writing a new one. A `down` migration that has never been run is a fiction, and running
one against production data is how you lose the data.

**`CREATE INDEX CONCURRENTLY` on any populated table.** A plain `CREATE INDEX` takes an
`ACCESS EXCLUSIVE` lock and blocks every read and write on that table for the duration.
On an empty table that is instant; on a live one it is an outage.

```sql
-- must be edited in by hand: drizzle-kit will not emit CONCURRENTLY
CREATE INDEX CONCURRENTLY IF NOT EXISTS events_location_gix
  ON events USING GIST (location);
```

`CONCURRENTLY` cannot run inside a transaction block, so that statement goes in its own
migration file with no other statement in it.

**Read the generated SQL before committing it.** `drizzle-kit` infers intent from a
diff. A rename looks identical to a drop plus an add — and it will generate the drop.
That is data loss, it will pass review if nobody reads the file, and it is not
recoverable.

## Changing a column safely: expand and contract

Never rename or retype in place on a populated table. Spread it across deploys:

```
1. ADD        add the new column, nullable. Deploy.
2. DUAL-WRITE write both columns. Deploy.
3. BACKFILL   fill the new column in batches. Not one UPDATE — a single UPDATE over
              millions of rows holds locks and bloats the table.
4. SWITCH     read from the new column. Deploy.
5. STOP       stop writing the old one. Deploy.
6. DROP       drop the old column. Deploy.
```

Slow on purpose. Every step is independently revertible, which is the entire point.

## Things drizzle-kit cannot generate

Write these by hand, in their own migration, with a comment explaining what they enforce:

- the PostGIS GiST index
- the ledger's deferred sum-to-zero constraint trigger
- the append-only rules on `ledger_entries`
- the generated `tsvector` column and its GIN index
- partial indexes with a predicate

## Before merging

- [ ] I read the generated SQL line by line
- [ ] No rename was generated as a drop plus an add
- [ ] Any index on a populated table is `CONCURRENTLY`, alone in its file
- [ ] `bun run db:check` passes
- [ ] It applies cleanly to an **empty** database (CI checks this)
- [ ] It applies cleanly to a **copy of staging** (you check this)
