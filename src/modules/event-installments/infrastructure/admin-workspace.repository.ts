import { createHash, randomUUID } from "node:crypto";

import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { OrganiserCatalog } from "../../../common/contracts/organiser-catalog.js";
import { AppError } from "../../../common/errors/app-error.js";
import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import {
  applyCommand,
  balance,
  units,
  scale,
  businessDate,
} from "../domain/admin-workspace.engine.js";
import {
  type Terms,
  type Customer,
  type InstallmentStore,
  type Command,
} from "../domain/admin-workspace.types.js";
export interface InstallmentSnapshot {
  state: InstallmentStore;
  revision: number;
}
function major(value: bigint, currency: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Stored amount exceeds the supported range");
  const minor = Number(value); // money-guard: exact checked integer conversion at JSON boundary
  return minor / scale(currency);
}
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class AdminWorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}
  private async customers(tx: Prisma.TransactionClient): Promise<Customer[]> {
    return (await tx.user.findMany({ where: { role: "CUSTOMER" } })).map(
      (u) => ({
        id: u.id,
        name:
          u.displayName ??
          ([u.firstName, u.lastName].filter(Boolean).join(" ") ||
            u.phone ||
            u.email ||
            "Customer"),
        phone: u.phone ?? "",
        email: u.email,
      }),
    );
  }
  private async snapshot(
    tx: Prisma.TransactionClient,
  ): Promise<InstallmentSnapshot> {
    const settings = await tx.adminInstallmentSettings.findUniqueOrThrow({
      where: { id: "global" },
    });
    const plans = await tx.eventInstallmentPlan.findMany({
      where: { adminTerms: { not: Prisma.DbNull } },
      orderBy: { createdAt: "asc" },
    });
    const agreements = await tx.eventInstallmentAgreement.findMany({
      where: { adminTerms: { not: Prisma.DbNull } },
      orderBy: { createdAt: "asc" },
    });
    const ids = agreements.map((a) => a.id);
    const schedules = await tx.eventInstallmentSchedule.findMany({
      where: { agreementId: { in: ids } },
      orderBy: [{ createdAt: "asc" }, { installmentNumber: "asc" }],
    });
    const payments = await tx.eventInstallmentPayment.findMany({
      where: {
        agreementId: { in: ids },
        status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] },
      },
      orderBy: { createdAt: "asc" },
    });
    const refunds = await tx.eventInstallmentRefund.findMany({
      where: {
        installmentPaymentId: { in: payments.map((p) => p.id) },
        status: "COMPLETED",
      },
      orderBy: { createdAt: "asc" },
    });
    const notices = await tx.eventInstallmentNotification.findMany({
      where: { agreementId: { in: ids } },
      orderBy: { createdAt: "asc" },
    });
    const audit = await tx.eventInstallmentAuditLog.findMany({
      where: { action: { startsWith: "admin.workspace." } },
      include: { actor: { select: { displayName: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });
    const currency = (id: string) =>
      agreements.find((a) => a.id === id)!.currency;
    return {
      revision: settings.revision,
      state: {
        version: 1,
        plans: plans.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? "",
          active: p.isActive,
          terms: p.adminTerms as unknown as Terms,
        })),
        agreements: agreements.map((a) => ({
          id: a.id,
          customer_id: a.customerId,
          plan_id: a.planId,
          product_id: a.productId,
          product_name: a.productName,
          quantity: a.quantity,
          total_amount: major(a.totalAmountMinor, a.currency),
          currency: a.currency,
          terms: a.adminTerms as unknown as Terms,
          start_date: businessDate(a.startDate.toISOString()),
          created_at: a.createdAt.toISOString(),
          cancelled: a.status === "CANCELLED",
        })),
        schedules: schedules.map((s) => ({
          id: s.id,
          agreement_id: s.agreementId,
          number: s.displayNumber ?? s.installmentNumber,
          due_date: businessDate(s.dueDate.toISOString()),
          amount: major(
            s.amountDueMinor - s.lateFeeAmountMinor,
            currency(s.agreementId),
          ),
          fee: major(s.lateFeeAmountMinor, currency(s.agreementId)),
          initial: s.isInitialPayment,
          voided: ["WAIVED", "CANCELLED"].includes(s.status),
        })),
        payments: payments.map((p) => ({
          id: p.id,
          agreement_id: p.agreementId,
          schedule_id: p.scheduleId,
          amount: major(p.amountMinor, p.currency),
          refunded: major(p.refundedAmountMinor, p.currency),
          payment_method:
            p.manualMethod ?? p.paymentMethod ?? "External receipt",
          transaction_reference: p.transactionReference ?? p.id,
          created_at: (p.paidAt ?? p.createdAt).toISOString(),
        })),
        refunds: refunds.map((r) => ({
          id: r.id,
          payment_id: r.installmentPaymentId,
          amount: major(
            r.amountMinor,
            payments.find((p) => p.id === r.installmentPaymentId)!.currency,
          ),
          reason: r.reason,
          created_at: (r.processedAt ?? r.createdAt).toISOString(),
        })),
        notices: notices
          .filter(
            (n) =>
              n.scheduleId &&
              ["DUE_REMINDER", "OVERDUE_NOTICE"].includes(n.notificationType),
          )
          .map((n) => ({
            id: n.id,
            agreement_id: n.agreementId!,
            schedule_id: n.scheduleId!,
            type:
              n.notificationType === "DUE_REMINDER" ? "reminder" : "overdue",
            channels: n.channels.map((c) => c.toLowerCase()) as (
              "sms" | "email"
            )[],
            created_at: n.createdAt.toISOString(),
            status: n.status.toLowerCase() as "pending" | "sent" | "failed",
          })),
        audit: audit.map((a) => ({
          id: a.id,
          action: a.action.replace("admin.workspace.", ""),
          reason: a.reason ?? "",
          actor: a.actor?.displayName ?? a.actor?.phone ?? "Administrator",
          created_at: a.createdAt.toISOString(),
          ...(a.entityType === "EventInstallmentAgreement"
            ? { agreement_id: a.entityId }
            : {}),
        })),
      },
    };
  }
  read() {
    return this.prisma.$transaction((tx) => this.snapshot(tx), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }
  async command(
    input: { command: Command; revision: number; requestId: string },
    actorId: string,
    catalog: OrganiserCatalog,
    catalogRevision: number,
    now: Date,
  ): Promise<InstallmentSnapshot> {
    const hash = createHash("sha256")
      .update(JSON.stringify({ actorId, ...input }))
      .digest("hex");
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const key = { key: input.requestId, endpoint: "admin/installments" };
          const receipt = await tx.idempotencyKey.findUnique({
            where: { key_endpoint: key },
          });
          if (receipt) {
            if (receipt.requestHash !== hash)
              throw AppError.conflict(
                ERROR_CODES.VALIDATION_FAILED,
                "Request ID already used",
              );
            return this.snapshot(tx);
          }
          const before = await this.snapshot(tx);
          if (before.revision !== input.revision)
            throw AppError.conflict(
              ERROR_CODES.VALIDATION_FAILED,
              "Installment data changed. Reload before saving.",
            );
          const command = input.command;
          if (command.type === "assign" && command.product_id) {
            const settings =
              await tx.organiserCatalogSettings.findUniqueOrThrow({
                where: { id: "global" },
              });
            if (settings.revision !== catalogRevision)
              throw AppError.conflict(
                ERROR_CODES.VALIDATION_FAILED,
                "Organiser prices changed. Reload before assigning this purchase.",
              );
          }
          let next: InstallmentStore;
          try {
            next = applyCommand(
              before.state,
              command,
              await this.customers(tx),
              catalog,
              actorId,
              now.toISOString(),
              randomUUID,
            );
          } catch (error) {
            throw AppError.validation({
              command: [
                error instanceof Error
                  ? error.message
                  : "Invalid installment command",
              ],
            });
          }
          const changed = <T extends { id: string }>(rows: T[], old: T[]) =>
            rows.filter(
              (row) =>
                JSON.stringify(old.find((r) => r.id === row.id)) !==
                JSON.stringify(row),
            );
          for (const p of changed(next.plans, before.state.plans)) {
            const data = {
              name: p.name,
              description: p.description,
              isActive: p.active,
              adminTerms: json(p.terms),
              frequency: p.terms.frequency.toUpperCase() as
                "WEEKLY" | "MONTHLY" | "YEARLY",
              intervalCount: p.terms.interval,
              installmentCount: p.terms.installment_count,
              initialPaymentType: "FIXED" as const,
              initialPaymentValue: 0n,
              interestRateBps: 0,
              lateFeeType: "FIXED" as const,
              lateFeeValue: 0n,
              gracePeriodDays: p.terms.grace_period_days,
              allowPartialPayment: p.terms.partial_payment,
              allowEarlyPayment: p.terms.early_payment,
              currency: "RWF",
            };
            await tx.eventInstallmentPlan.upsert({
              where: { id: p.id },
              create: { id: p.id, ...data },
              update: data,
            });
          }
          const affected = new Set<string>();
          for (const a of changed(next.agreements, before.state.agreements)) {
            const data = {
              customerId: a.customer_id,
              planId: a.plan_id,
              eventId: null,
              productId: a.product_id,
              productName: a.product_name,
              quantity: a.quantity,
              adminTerms: json(a.terms),
              totalAmountMinor: BigInt(units(a.total_amount, a.currency)),
              initialPaymentMinor: BigInt(
                units(a.terms.initial_payment, a.currency),
              ),
              currency: a.currency,
              frequency: a.terms.frequency.toUpperCase() as
                "WEEKLY" | "MONTHLY" | "YEARLY",
              intervalCount: a.terms.interval,
              installmentCount: a.terms.installment_count,
              gracePeriodDays: a.terms.grace_period_days,
              allowPartialPayment: a.terms.partial_payment,
              allowEarlyPayment: a.terms.early_payment,
              startDate: new Date(a.start_date + "T00:00:00Z"),
              status: a.cancelled
                ? ("CANCELLED" as const)
                : ("ACTIVE" as const),
            };
            const rows = next.schedules.filter(
              (s) => s.agreement_id === a.id && !s.voided,
            );
            const payable = rows.reduce(
              (n, s) =>
                n +
                BigInt(units(s.amount, a.currency)) +
                BigInt(units(s.fee, a.currency)),
              0n,
            );
            await tx.eventInstallmentAgreement.upsert({
              where: { id: a.id },
              create: {
                id: a.id,
                ...data,
                interestAmountMinor:
                  payable - BigInt(units(a.total_amount, a.currency)),
                totalPayableMinor: payable,
                outstandingBalanceMinor: payable,
              },
              update: data,
            });
            affected.add(a.id);
          }
          for (const s of changed(next.schedules, before.state.schedules)) {
            const a = next.agreements.find((a) => a.id === s.agreement_id)!;
            const existing = before.state.schedules.find(
              (row) => row.id === s.id,
            );
            const count = existing
              ? undefined
              : ((
                  await tx.eventInstallmentSchedule.aggregate({
                    where: { agreementId: a.id },
                    _max: { installmentNumber: true },
                  })
                )._max.installmentNumber ?? 0);
            const data = {
              agreementId: a.id,
              displayNumber: s.number,
              isInitialPayment: s.initial,
              dueDate: new Date(s.due_date + "T00:00:00Z"),
              principalAmountMinor: BigInt(units(s.amount, a.currency)),
              interestAmountMinor: 0n,
              lateFeeAmountMinor: BigInt(units(s.fee, a.currency)),
              amountDueMinor:
                BigInt(units(s.amount, a.currency)) +
                BigInt(units(s.fee, a.currency)),
              outstandingAmountMinor: BigInt(
                units(balance(next, s), a.currency),
              ),
              status: s.voided ? ("CANCELLED" as const) : ("PENDING" as const),
            };
            if (existing)
              await tx.eventInstallmentSchedule.update({
                where: { id: s.id },
                data,
              });
            else
              await tx.eventInstallmentSchedule.create({
                data: { id: s.id, ...data, installmentNumber: count! + 1 },
              });
            affected.add(a.id);
          }
          for (const p of changed(next.payments, before.state.payments)) {
            const a = next.agreements.find((a) => a.id === p.agreement_id)!;
            const data = {
              agreementId: p.agreement_id,
              scheduleId: p.schedule_id,
              customerId: a.customer_id,
              source: "MANUAL" as const,
              manualMethod: p.payment_method,
              transactionReference: p.transaction_reference,
              amountMinor: BigInt(units(p.amount, a.currency)),
              refundedAmountMinor: BigInt(units(p.refunded, a.currency)),
              currency: a.currency,
              status:
                p.refunded === p.amount
                  ? ("REFUNDED" as const)
                  : p.refunded > 0
                    ? ("PARTIALLY_REFUNDED" as const)
                    : ("SUCCEEDED" as const),
              paidAt: new Date(p.created_at),
            };
            if (before.state.payments.some((old) => old.id === p.id))
              await tx.eventInstallmentPayment.update({
                where: { id: p.id },
                data: {
                  refundedAmountMinor: data.refundedAmountMinor,
                  status: data.status,
                },
              });
            else
              await tx.eventInstallmentPayment.create({
                data: { id: p.id, ...data },
              });
            affected.add(a.id);
          }
          for (const r of changed(next.refunds, before.state.refunds)) {
            const payment = next.payments.find((p) => p.id === r.payment_id)!;
            const a = next.agreements.find(
              (a) => a.id === payment.agreement_id,
            )!;
            await tx.eventInstallmentRefund.create({
              data: {
                id: r.id,
                installmentPaymentId: r.payment_id,
                amountMinor: BigInt(units(r.amount, a.currency)),
                reason: r.reason,
                status: "COMPLETED",
                processedBy: actorId,
                processedAt: now,
              },
            });
          }
          if (command.type === "fee") {
            const s = next.schedules.find((s) => s.id === command.schedule_id)!,
              a = next.agreements.find((a) => a.id === s.agreement_id)!;
            await tx.eventInstallmentLateFee.create({
              data: {
                agreementId: a.id,
                scheduleId: s.id,
                feeType: command.fee_type === "fixed" ? "FIXED" : "PERCENT",
                amountMinor: BigInt(units(s.fee, a.currency)),
                reason: command.reason,
                status: "APPLIED",
                appliedAt: now,
              },
            });
          }
          for (const n of changed(next.notices, before.state.notices))
            await tx.eventInstallmentNotification.create({
              data: {
                id: n.id,
                customerId: next.agreements.find(
                  (a) => a.id === n.agreement_id,
                )!.customer_id,
                agreementId: n.agreement_id,
                scheduleId: n.schedule_id,
                notificationType:
                  n.type === "reminder" ? "DUE_REMINDER" : "OVERDUE_NOTICE",
                channels: n.channels.map((c) => c.toUpperCase()) as (
                  "SMS" | "EMAIL"
                )[],
                status: "PENDING",
              },
            });
          for (const id of affected) {
            const a = next.agreements.find((a) => a.id === id)!;
            const rows = next.schedules.filter((s) => s.agreement_id === id);
            const payments = next.payments.filter((p) => p.agreement_id === id);
            let remaining = 0n,
              payable = 0n,
              fees = 0n;
            for (const row of rows) {
              const paid = payments
                .filter((p) => p.schedule_id === row.id)
                .reduce((n, p) => n + BigInt(units(p.amount, a.currency)), 0n);
              const refunded = payments
                .filter((p) => p.schedule_id === row.id)
                .reduce(
                  (n, p) => n + BigInt(units(p.refunded, a.currency)),
                  0n,
                );
              const owed = BigInt(units(balance(next, row), a.currency));
              await tx.eventInstallmentSchedule.update({
                where: { id: row.id },
                data: {
                  amountPaidMinor: paid,
                  refundedAmountMinor: refunded,
                  outstandingAmountMinor: owed,
                  status: row.voided
                    ? "CANCELLED"
                    : owed === 0n
                      ? "PAID"
                      : row.due_date < businessDate(now.toISOString())
                        ? "OVERDUE"
                        : paid > refunded
                          ? "PARTIALLY_PAID"
                          : "PENDING",
                },
              });
              remaining += owed;
              if (!row.voided)
                payable +=
                  BigInt(units(row.amount, a.currency)) +
                  BigInt(units(row.fee, a.currency));
              fees += BigInt(units(row.fee, a.currency));
            }
            await tx.eventInstallmentAgreement.update({
              where: { id },
              data: {
                totalPayableMinor: payable,
                amountPaidMinor: payments.reduce(
                  (n, p) => n + BigInt(units(p.amount, a.currency)),
                  0n,
                ),
                refundedAmountMinor: payments.reduce(
                  (n, p) => n + BigInt(units(p.refunded, a.currency)),
                  0n,
                ),
                lateFeesTotalMinor: fees,
                outstandingBalanceMinor: a.cancelled ? 0n : remaining,
                status: a.cancelled
                  ? "CANCELLED"
                  : remaining === 0n
                    ? "COMPLETED"
                    : rows.some(
                          (s) =>
                            !s.voided &&
                            s.due_date < businessDate(now.toISOString()) &&
                            balance(next, s) > 0,
                        )
                      ? "OVERDUE"
                      : "ACTIVE",
              },
            });
          }
          const entry = next.audit[0]!;
          await tx.eventInstallmentAuditLog.create({
            data: {
              actorId,
              action: `admin.workspace.${entry.action}`,
              entityType: entry.agreement_id
                ? "EventInstallmentAgreement"
                : "AdminInstallments",
              entityId: entry.agreement_id ?? input.requestId,
              reason: entry.reason,
              newValues: { command: json(command) },
            },
          });
          await tx.adminInstallmentSettings.update({
            where: { id: "global" },
            data: { revision: { increment: 1 } },
          });
          const result = await this.snapshot(tx);
          await tx.idempotencyKey.create({
            data: {
              ...key,
              requestHash: hash,
              status: "COMPLETED",
              responseStatus: 200,
              responseBody: { revision: result.revision },
            },
          });
          return result;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code)
      )
        throw AppError.conflict(
          ERROR_CODES.VALIDATION_FAILED,
          "Another installment action completed concurrently. Reload and try again.",
        );
      throw error;
    }
  }
}
