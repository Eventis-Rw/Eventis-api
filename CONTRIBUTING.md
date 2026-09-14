# Contributing to Eventis

This file is the same in every Eventis repository. Read it once.

## Setup

```bash
bun install
bun run verify
```

If setup takes you more than 30 minutes, the setup is the bug — say so and we fix it.

## Branching

```
feat/* fix/* chore/* docs/*  ──PR──▶  dev  ──release PR──▶  main
```

- **Always branch from `dev`. Always open your PR against `dev`.** Never against `main`.
- `main` is production. It moves only through a release PR from `dev`.
- Branch names: `feat/discovery-radius-filter`, `fix/otp-rate-limit-window`,
  `chore/bump-bun`, `docs/checkin-runbook`.
- Merge your branch within **3 days**. A branch open for two weeks is a merge conflict with
  a deadline.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint in CI.

```
feat(discovery): filter the feed by category
fix(identity): reset the OTP attempt counter on a successful verify
docs(adr): record the choice of Drizzle over Prisma
```

Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`.

A breaking change gets a `!` and a `BREAKING CHANGE:` footer explaining the migration.

## Pull requests

One PR does one thing. If you cannot describe it in a single sentence without "and", split it.

- Fill in the template. The Definition of Done checklist is not decoration — a reviewer will
  send it back.
- **One task in progress per person.** Finish it before you start the next one.
- Every PR needs one approving review. Anything touching payments, ledger, auth or personal
  data needs the tech lead — CODEOWNERS enforces this.
- Rebase or squash, never a merge commit. `main` and `dev` keep a linear history.

## Definition of done

A change is done when all of this is true — not when the code works on your machine.

- [ ] `bun run typecheck` clean
- [ ] `bun run lint` clean
- [ ] `bun run depcruise` clean — module boundaries intact
- [ ] Tests added or updated and passing
- [ ] **A bug fix has a regression test that fails before the fix and passes after.** If you
      did not see it fail, you have not proven it tests anything.
- [ ] Contracts updated and a changeset added if the API surface changed
- [ ] Migration committed, forward-only, `CREATE INDEX CONCURRENTLY` on a populated table
- [ ] Empty and error states written as part of the feature
- [ ] No new Sentry errors on staging
- [ ] No secrets, keys, `.env` files or real phone numbers in the diff
- [ ] You have demoed it

## Testing

Test the contract and the edge cases, not the internals. Ask, for anything you write:
nulls and empties, boundaries, concurrency, partial failure, retries and duplicates, restart
mid-state, clocks and timezones, network drop.

**Never weaken a test to make it pass.** A failing test is information. If a test is wrong,
fix the test deliberately and say so in the PR.

## Reviewing

The author never approves their own work. As a reviewer:

- Read the failure modes, not the happy path.
- Ask "what happens on the second call" of anything that writes.
- If you do not understand it, that is a finding, not a gap in you.
- Be specific and factual. Review the change, not the person.

## Things that are never okay

- Committing a secret, a `.env`, a key file, or a real phone number. **These repositories are
  public.** If you do it: rotate the credential first, then tell the tech lead.
- Logging a full phone number, an OTP, or a token.
- `parseFloat` or `Number()` on money.
- Granting an entitlement from a client callback.
- Returning a database row from an endpoint.
- Editing `components/ui/*` primitives inside a feature PR.
- Weakening a boundary rule to make your import work. The rule is the design.

## Getting help

Stuck for more than an hour? Ask. Blocking on a decision that is not yours to make? Ask.
"I'm not sure, here's my plan" is always a better message than a confident guess.
