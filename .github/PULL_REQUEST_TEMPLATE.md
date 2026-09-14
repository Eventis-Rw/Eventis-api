## What and why

<!-- What changes, and what problem it solves. Link the issue: Closes #123 -->

## How to verify

<!-- Exact steps a reviewer runs. Not "it works". -->

## Definition of done

- [ ] Types check — `bun run typecheck` clean
- [ ] Lint clean — `bun run lint`
- [ ] Module boundaries clean — `bun run depcruise`
- [ ] Tests added or updated, and passing — a bug fix has a regression test that fails before the fix
- [ ] Contracts updated and released if the API surface changed
- [ ] Migration committed, forward-only, index created `CONCURRENTLY` if the table is populated
- [ ] Query budget respected — no new query over the budget, plan checked if this touches a list endpoint
- [ ] Empty and error states written, not left for later
- [ ] No new Sentry errors on staging
- [ ] No secrets, keys, `.env` files or real phone numbers in the diff
- [ ] I have demoed this

## Risk

- [ ] Touches payments, ledger, auth, or personal data — **tech lead review required**
- [ ] Contains a breaking API change — migration path described below
- [ ] Irreversible or production-affecting — rollback plan described below

<!-- If any box above is ticked, explain here. -->

## Screenshots / recordings

<!-- Required for any user-facing change. -->
