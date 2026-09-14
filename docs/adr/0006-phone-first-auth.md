# 0006 — Phone-first authentication with OTP

**Status:** Accepted · **Date:** 2026-09-14

## Context

The market is Kigali. Email is not the primary identity; a phone number is, and it is
also the mobile money account that will pay for tickets.

## Decision

Phone number plus SMS OTP. No password. Email is optional profile data.

Numbers are normalized to E.164 **once**, at the identity boundary, so a number has
exactly one representation everywhere in the system.

JWT access tokens, short-lived, with refresh rotation and **reuse detection**: if a
refresh token is presented twice, the whole session family is revoked, because the
second presentation means one of the two holders is an attacker.

## OTP rate limiting is a load-bearing security control

Not a nicety. **SMS pumping fraud** — an attacker triggering thousands of OTPs toward
premium-rate numbers they collect revenue on — has bankrupted startups outright.

Limits are layered, because any single one is bypassable:

- per phone number
- per device id
- per IP
- per country prefix
- a hard daily spend cap **at the gateway**, not only in application code
- progressive delay after three failures

## Consequences

Every sign-in costs money. That is a direct incentive to keep sessions long and to make
refresh work reliably — a user forced to re-authenticate is a user costing an SMS.

An OTP is never logged. Neither is a full phone number: logs carry `+2507****456`.

Admin authentication requires a second factor, on a path separate from customer auth.
An admin can approve payouts; that is not the same risk as a customer account.
