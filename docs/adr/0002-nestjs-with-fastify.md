# 0002 — NestJS on the Fastify adapter

**Status:** Accepted · **Date:** 2026-09-14

## Context

An API built largely by interns, where consistency of structure matters more than the
freedom of any individual file.

## Decision

NestJS, on the **Fastify** adapter rather than the default Express one.

## Why NestJS

Express has no opinions. With eight interns that means eight file layouts by week four,
and a codebase where finding the authorization check means reading every route.

NestJS supplies modules, dependency injection, guards, pipes and interceptors, and those
map exactly onto the boundaries this system needs: a module per bounded area, a pipe for
Zod validation, an interceptor for idempotency, a guard for RBAC, a filter for the single
error envelope.

Dependency injection also makes the clock, the payment provider and the SMS gateway
injectable, which is what makes them fakeable in tests. That is not a style preference —
it is the difference between testing the payment state machine and not testing it.

## Why Fastify

Roughly twice the throughput of Express for the same code, and faster serialization.
The cost is a smaller middleware ecosystem, which matters little because Nest supplies
most of what would otherwise be middleware.

## Consequences

A learning curve for interns who have only used Express. Mitigated by the reference
module (`catalog`) and `docs/guides/adding-a-module.md`, which together mean the first
question is "what goes in each layer", not "where do I start".

Fastify-specific types appear in `main.ts` and in the exception filter. Contained
deliberately: application code never touches the request object directly.
