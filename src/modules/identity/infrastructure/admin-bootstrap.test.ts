import assert from "node:assert/strict";

import { describe, expect, it } from "bun:test";

import { verifyAdminPassword } from "../domain/admin-password.js";

import { bootstrapAdmin } from "./admin-bootstrap.js";

const credentials = {
  email: "ADMIN@example.com",
  password: "Private seed password 42!",
};
function fixture(existing: Record<string, unknown> | null = null) {
  let account = existing;
  let creates = 0;
  let audits = 0;
  let revocations = 0;
  const tx = {
    $queryRaw: () => Promise.resolve([]),
    user: {
      findFirst: () => Promise.resolve(account),
      create: ({ data }: { data: Record<string, unknown> }) => {
        account = { ...data, id: "seeded-admin-id", deletedAt: null };
        creates++;
        return Promise.resolve(account);
      },
      update: ({ data }: { data: Record<string, unknown> }) => {
        account = { ...account, ...data };
        return Promise.resolve(account);
      },
    },
    auditLog: {
      create: () => {
        audits++;
        return Promise.resolve({});
      },
    },
    refreshSession: {
      updateMany: () => {
        revocations++;
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const prisma = {
    $transaction: (fn: (db: typeof tx) => unknown) => Promise.resolve(fn(tx)),
  };
  return {
    prisma,
    account: () => account,
    stats: () => ({ creates, audits, revocations }),
  };
}
describe("admin bootstrap", () => {
  it("creates a dedicated admin without a phone, hashes credentials, and is idempotent", async () => {
    const f = fixture();
    const first = await bootstrapAdmin(f.prisma as never, credentials);
    expect(first.outcome).toBe("created");
    expect(f.account()?.role).toBe("ADMIN");
    expect(f.account()?.email).toBe("admin@example.com");
    expect(f.account()?.phone).toBeUndefined();
    expect(
      await verifyAdminPassword(
        credentials.password,
        String(f.account()?.adminPasswordHash),
      ),
    ).toBe(true);
    const again = await bootstrapAdmin(f.prisma as never, credentials);
    expect(again.outcome).toBe("unchanged");
    expect(f.stats()).toEqual({ creates: 1, audits: 1, revocations: 0 });
  });
  it("refuses to promote an ordinary account or reactivate an inactive admin", async () => {
    for (const existing of [
      { id: "customer", role: "CUSTOMER", status: "ACTIVE" },
      { id: "admin", role: "ADMIN", status: "INACTIVE" },
    ]) {
      const f = fixture(existing);
      await assert.rejects(
        bootstrapAdmin(f.prisma as never, credentials),
        /non-admin, inactive/,
      );
      expect(f.stats().creates).toBe(0);
    }
  });
  it("requires explicit password rotation and revokes refresh sessions on rotation", async () => {
    const f = fixture();
    await bootstrapAdmin(f.prisma as never, credentials);
    const changed = { ...credentials, password: "A replacement password 73!" };
    await assert.rejects(
      bootstrapAdmin(f.prisma as never, changed),
      /ADMIN_SEED_ROTATE_PASSWORD/,
    );
    const rotated = await bootstrapAdmin(f.prisma as never, {
      ...changed,
      rotatePassword: true,
    });
    expect(rotated.outcome).toBe("password-updated");
    expect(
      await verifyAdminPassword(
        changed.password,
        String(f.account()?.adminPasswordHash),
      ),
    ).toBe(true);
    expect(f.stats().revocations).toBe(1);
  });
});
