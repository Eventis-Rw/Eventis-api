import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";
import { Prisma, type OrganiserPlanInterval } from "@prisma/client";

import { AppError } from "../../../common/errors/app-error.js";
import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import {
  defaultOrganiserCatalog,
  validateOrganiserCatalog,
  type OrganiserCatalog,
  type PlanInterval,
} from "../domain/admin-catalog.js";
const intervals: Record<PlanInterval, OrganiserPlanInterval> = {
  post: "PAY_PER_POST",
  month: "MONTHLY",
  quarter: "QUARTERLY",
  year: "YEARLY",
};
const reverse: Record<OrganiserPlanInterval, PlanInterval> = {
  PAY_PER_POST: "post",
  MONTHLY: "month",
  QUARTERLY: "quarter",
  YEARLY: "year",
};
export type VersionedCatalog = OrganiserCatalog & { revision: number };
@Injectable()
export class AdminCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}
  async read(): Promise<VersionedCatalog> {
    return this.prisma.$transaction(
      async (tx) => {
        const settings = await tx.organiserCatalogSettings.findUnique({
          where: { id: "global" },
        });
        const rows = await tx.organiserPlan.findMany({
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        // The initial catalog is a quote until the admin explicitly saves it.
        if (!rows.length)
          return {
            ...defaultOrganiserCatalog(),
            revision: settings?.revision ?? 0,
          };
        const result: VersionedCatalog = {
          version: 1,
          currency: "RWF",
          revision: settings?.revision ?? 0,
          payment_methods: (settings?.paymentMethods ?? [
            "mtn_momo",
            "airtel_money",
          ]) as OrganiserCatalog["payment_methods"],
          plans: rows.map((row) => ({
            id: row.frontendId ?? row.id,
            name: row.name,
            interval: reverse[row.interval],
            description: row.description,
            features: row.features as string[],
            badge: row.badge ?? "",
            active: row.active,
            recommended: row.recommended,
            prices:
              Array.isArray(row.prices) && row.prices.length
                ? (row.prices as unknown as OrganiserCatalog["plans"][number]["prices"])
                : [
                    {
                      quantity:
                        row.interval === "PAY_PER_POST"
                          ? (row.postQuota ?? 1)
                          : 1,
                      total: this.safeAmount(row.priceMinor),
                    },
                  ],
          })),
        };
        validateOrganiserCatalog(result);
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async save(
    catalog: VersionedCatalog,
    actorId: string,
  ): Promise<VersionedCatalog> {
    try {
      validateOrganiserCatalog(catalog);
    } catch (error) {
      throw AppError.validation({
        catalog: [error instanceof Error ? error.message : "Invalid catalog"],
      });
    }
    if (!Number.isSafeInteger(catalog.revision) || catalog.revision < 0)
      throw AppError.validation({
        revision: ["Reload the catalog before saving"],
      });
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const settings = await tx.organiserCatalogSettings.upsert({
            where: { id: "global" },
            create: { id: "global" },
            update: {},
          });
          if (settings.revision !== catalog.revision)
            throw AppError.conflict(
              ERROR_CODES.VALIDATION_FAILED,
              "The catalog was changed by another administrator. Reload before saving.",
            );
          await tx.organiserCatalogSettings.update({
            where: { id: "global" },
            data: {
              revision: { increment: 1 },
              paymentMethods: catalog.payment_methods,
            },
          });
          const existing = await tx.organiserPlan.findMany();
          const kept: string[] = [];
          for (const plan of catalog.plans) {
            const prior = existing.find(
              (row) => (row.frontendId ?? row.id) === plan.id,
            );
            const first =
              plan.prices.find((price) => price.quantity === 1) ??
              plan.prices[0]!;
            const data = {
              interval: intervals[plan.interval],
              name: plan.name,
              description: plan.description,
              prices: plan.prices.map((price) => ({
                quantity: price.quantity,
                total: price.total,
              })),
              features: plan.features,
              badge: plan.badge,
              recommended: plan.recommended,
              active: plan.active,
              priceMinor: BigInt(first.total),
              currency: "RWF",
              postQuota: plan.interval === "post" ? first.quantity : null,
              durationDays:
                plan.interval === "post"
                  ? 1
                  : plan.interval === "month"
                    ? 30
                    : plan.interval === "quarter"
                      ? 90
                      : 365,
            };
            const saved = prior
              ? await tx.organiserPlan.update({ where: { id: prior.id }, data })
              : await tx.organiserPlan.create({
                  data: {
                    ...data,
                    code: plan.id,
                    frontendId: plan.id,
                    interval: intervals[plan.interval],
                  },
                });
            kept.push(saved.id);
          }
          await tx.organiserPlan.updateMany({
            where: { id: { notIn: kept } },
            data: { active: false },
          });
          await tx.auditLog.create({
            data: {
              actorId,
              actorRole: "admin",
              action: "organiser.catalog.updated",
              subjectType: "OrganiserCatalog",
              changes: {
                revision: catalog.revision + 1,
                plans: catalog.plans.map((p) => p.id),
              },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      )
        throw AppError.conflict(
          ERROR_CODES.VALIDATION_FAILED,
          "Concurrent catalog update. Reload and try again.",
        );
      throw error;
    }
    return this.read();
  }
  private safeAmount(value: bigint): number {
    const amount = Number(value);
    if (!Number.isSafeInteger(amount))
      throw new Error(
        "Stored catalog amount is outside the admin’s supported range",
      );
    return amount;
  }
}
