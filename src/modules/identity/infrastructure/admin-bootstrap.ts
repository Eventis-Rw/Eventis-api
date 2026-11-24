import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { SystemClock, type Clock } from "../../../common/clock.js";
import {
  hashAdminPassword,
  validateAdminPassword,
  verifyAdminPassword,
} from "../domain/admin-password.js";

const seedInput = z.object({
  email: z
    .email()
    .trim()
    .max(255)
    .transform((value) => value.toLowerCase()),
  password: z.string(),
  name: z.string().trim().min(2).max(60).default("Eventis Admin"),
  rotatePassword: z.boolean().default(false),
});
export async function bootstrapAdmin(
  prisma: PrismaClient,
  rawInput: z.input<typeof seedInput>,
  clock: Clock = new SystemClock(),
) {
  const input = seedInput.parse(rawInput);
  validateAdminPassword(input.password);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`admin-seed:${input.email}`}))::text`;
      const existing = await tx.user.findFirst({
        where: { email: { equals: input.email, mode: "insensitive" } },
      });
      if (
        existing &&
        (existing.role !== "ADMIN" ||
          existing.status !== "ACTIVE" ||
          existing.deletedAt)
      ) {
        throw new Error(
          "Seed email belongs to a non-admin, inactive, or deleted account. Choose a dedicated admin email.",
        );
      }
      if (existing?.adminPasswordHash) {
        if (
          await verifyAdminPassword(input.password, existing.adminPasswordHash)
        )
          return { userId: existing.id, outcome: "unchanged" as const };
        if (!input.rotatePassword)
          throw new Error(
            "Admin already has a different password. Set ADMIN_SEED_ROTATE_PASSWORD=true to rotate it explicitly.",
          );
      }
      const adminPasswordHash = await hashAdminPassword(input.password);
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { adminPasswordHash },
          })
        : await tx.user.create({
            data: {
              email: input.email,
              displayName: input.name,
              firstName: input.name,
              role: "ADMIN",
              status: "ACTIVE",
              adminPasswordHash,
            },
          });
      if (existing)
        await tx.refreshSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: clock.now() },
        });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: "ADMIN",
          action: existing ? "admin.password.seed" : "admin.bootstrap",
          subjectType: "user",
          subjectId: user.id,
          changes: { authentication: "email_password" },
        },
      });
      return {
        userId: user.id,
        outcome: existing
          ? ("password-updated" as const)
          : ("created" as const),
      };
    },
    { timeout: 15_000 },
  );
}
