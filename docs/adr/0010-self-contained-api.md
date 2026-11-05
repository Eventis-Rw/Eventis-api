# ADR 0010 — Keep API contracts and tooling in this repository

Status: Accepted, 2026-11-05. Supersedes the separate package dependency described in ADR 0004 and the previous repository topology.

## Context

The API depended on unpublished contracts, ESLint, and TypeScript packages from a repository unavailable to the team. A fresh API checkout could not install or build without locally registered package links.

## Decision

Keep HTTP schemas and their tests in `src/contracts`, lint configuration in `config/eslint`, and compiler defaults in `tsconfig.base.json`. Import contracts through relative paths and commit `bun.lock` with public dependencies only.

## Consequences

Developers, CI, and Docker can build the API independently. Schemas, response types, error codes, and validation behavior are preserved. Changes to contracts must remain compatible with deployed mobile clients. Future package extraction requires an accessible distribution plan.
