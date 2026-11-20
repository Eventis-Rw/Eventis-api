import { createHash } from "node:crypto";

import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";
import {
  Prisma,
  type InstallmentPlan,
  type AgeVerificationStatus,
} from "@prisma/client";

import { AppError } from "../../../common/errors/app-error.js";
import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import {
  applyMembershipCommand,
  defaultPermissions,
  type Demo,
  type Permissions,
  type Plan,
  type Member,
  type Command,
} from "../domain/admin-membership.js";
export interface MembershipSnapshot {
  state: Demo;
  revision: number;
}
const periods = { WEEKLY: "week", MONTHLY: "month", YEARLY: "year" } as const;
function planId(p: InstallmentPlan): string {
  return `findlove_${p.accountType.toLowerCase()}_${periods[p.interval]}`;
}
function amount(n: bigint): number {
  const value = Number(n);
  if (!Number.isSafeInteger(value) || value < 0 || value > 1e9)
    throw new Error("Stored membership amount exceeds the supported range");
  return value;
}
function planValue(p: InstallmentPlan): Plan {
  return {
    id: planId(p),
    tier: p.accountType === "PRIVATE" ? "private" : "public",
    period: periods[p.interval],
    days: p.durationDays,
    price: amount(p.priceMinor),
    active: p.isActive,
  };
}
function verified(
  status: AgeVerificationStatus | undefined,
): Member["verification"] {
  return status === "VERIFIED"
    ? "verified"
    : status === "REJECTED"
      ? "rejected"
      : status === "FAILED"
        ? "resubmission_required"
        : "pending";
}
@Injectable()
export class AdminMembershipRepository {
  constructor(private readonly prisma: PrismaService) {}
  private async snapshot(
    tx: Prisma.TransactionClient,
  ): Promise<MembershipSnapshot> {
    const settings = await tx.findLoveAdminSettings.findUniqueOrThrow({
      where: { id: "global" },
    });
    const plans = await tx.installmentPlan.findMany({
      orderBy: [{ accountType: "asc" }, { durationDays: "asc" }],
    });
    const profiles = await tx.loveProfile.findMany({
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    const ids = profiles.map((p) => p.userId);
    const verifications = await tx.ageVerification.findMany({
      where: { userId: { in: ids } },
      orderBy: { submittedAt: "desc" },
    });
    const subscriptions = await tx.serviceSubscription.findMany({
      where: { userId: { in: ids }, service: "FINDLOVE" },
      include: { paymentIntent: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const payments = await tx.paymentIntent.findMany({
      where: {
        userId: { in: ids },
        purpose: "FINDLOVE",
        installmentPlanId: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });
    const reports = await tx.userReport.findMany({
      where: { reportedUserId: { in: ids } },
      orderBy: { createdAt: "desc" },
    });
    const audit = await tx.auditLog.findMany({
      where: { action: { startsWith: "findlove.admin." } },
      orderBy: { id: "desc" },
      take: 2000,
    });
    const actors = await tx.user.findMany({
      where: {
        id: {
          in: audit
            .map((a) => a.actorId)
            .filter((id): id is string => id !== null),
        },
      },
      select: { id: true, displayName: true, phone: true },
    });
    const state: Demo = {
      version: 1,
      plans: plans.map(planValue),
      permissions: settings.permissions as unknown as Permissions,
      members: profiles.map((profile) => {
        const user = profile.user,
          verification = verifications.find((v) => v.userId === user.id);
        const sub =
          subscriptions.find((s) => s.userId === user.id && !s.revokedAt) ??
          subscriptions.find((s) => s.userId === user.id);
        const plan = plans.find((p) => p.id === sub?.installmentPlanId);
        const member: Member = {
          id: user.id,
          name:
            user.displayName ??
            ([user.firstName, user.lastName].filter(Boolean).join(" ") ||
              profile.username),
          username: profile.username,
          country: profile.country,
          dob: (verification?.dateOfBirth ?? profile.dateOfBirth)
            .toISOString()
            .slice(0, 10),
          account:
            user.adminAccountStatus === "banned"
              ? "banned"
              : user.status === "ACTIVE"
                ? "active"
                : "suspended",
          verification: verified(
            verification?.status === "VERIFIED" && !verification.dateOfBirth
              ? "MANUAL_REVIEW"
              : verification?.status,
          ),
          document:
            verification?.documentType === "PASSPORT"
              ? "Passport"
              : "National ID",
        };
        if (sub)
          member.membership = {
            tier: sub.accountType === "PRIVATE" ? "private" : "public",
            status: sub.revokedAt ? "revoked" : "active",
            startsAt: sub.startsAt.toISOString(),
            expiresAt: sub.expiresAt.toISOString(),
            price: amount(
              sub.priceMinor ??
                sub.paymentIntent?.amountMinor ??
                plan?.priceMinor ??
                0n,
            ),
            planId: plan ? planId(plan) : "",
            permissions:
              (sub.permissionsSnapshot as unknown as Permissions | null) ??
              defaultPermissions(),
          };
        return member;
      }),
      payments: payments.map((payment) => {
        const native = plans.find((p) => p.id === payment.installmentPlanId)!;
        const quoted = payment.planSnapshot as unknown as {
          plan?: Plan;
          permissions?: Permissions;
        } | null;
        const plan = quoted?.plan ?? {
          ...planValue(native),
          price: amount(payment.amountMinor),
        };
        return {
          id: payment.id,
          memberId: payment.userId,
          plan,
          permissions: quoted?.permissions ?? defaultPermissions(),
          amount: amount(payment.amountMinor),
          method:
            payment.paymentMethod === "MTN_MOMO" ? "MTN MoMo" : "Airtel Money",
          status:
            payment.status === "SUCCEEDED"
              ? "success"
              : [
                    "CREATED",
                    "PROVIDER_REQUESTED",
                    "AWAITING_USER",
                    "UNKNOWN",
                    "RECONCILING",
                  ].includes(payment.status)
                ? "pending"
                : "failed",
          createdAt: payment.createdAt.toISOString(),
        };
      }),
      reports: reports.map((r) => ({
        id: r.id,
        memberId: r.reportedUserId,
        category: r.reason,
        details: r.details ?? "",
        status:
          r.status === "OPEN"
            ? "open"
            : r.status === "DISMISSED"
              ? "dismissed"
              : "resolved",
      })),
      audit: audit.map((row) => {
        const data = row.changes as {
          reason?: string;
          details?: string;
          target?: string;
        };
        return {
          actorName:
            actors.find((a) => a.id === row.actorId)?.displayName ??
            actors.find((a) => a.id === row.actorId)?.phone ??
            "Administrator",
          id: String(row.id),
          at: row.createdAt.toISOString(),
          action: row.action.replace("findlove.admin.", ""),
          target: data.target ?? row.subjectId ?? "",
          reason: data.reason ?? "",
          details: data.details ?? "",
        };
      }),
    };
    return { state, revision: settings.revision };
  }
  async read() {
    return this.prisma.$transaction((tx) => this.snapshot(tx), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }
  async command(
    input: { command: Command; revision: number; requestId: string },
    actorId: string,
    now: Date,
  ): Promise<MembershipSnapshot> {
    const hash = createHash("sha256")
      .update(JSON.stringify({ actorId, ...input }))
      .digest("hex");
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.idempotencyKey.findUnique({
            where: {
              key_endpoint: {
                key: input.requestId,
                endpoint: "admin/findlove",
              },
            },
          });
          if (existing) {
            if (existing.requestHash !== hash)
              throw AppError.conflict(
                ERROR_CODES.VALIDATION_FAILED,
                "This request ID was already used for a different action",
              );
            return this.snapshot(tx);
          }
          const before = await this.snapshot(tx);
          if (input.revision !== before.revision)
            throw AppError.conflict(
              ERROR_CODES.VALIDATION_FAILED,
              "FindLove data changed. Reload before applying this action.",
            );
          const command = input.command;
          let next: Demo;
          try {
            next = applyMembershipCommand(
              before.state,
              command,
              now.getTime(),
              input.requestId,
            );
          } catch (error) {
            throw AppError.validation({
              command: [
                error instanceof Error
                  ? error.message
                  : "Invalid membership action",
              ],
            });
          }
          if (command.type === "plan") {
            const plan = next.plans.find((p) => p.id === command.id)!;
            const native = (await tx.installmentPlan.findMany()).find(
              (p) => planId(p) === plan.id,
            );
            if (!native) throw AppError.notFound("Membership plan");
            await tx.installmentPlan.update({
              where: { id: native.id },
              data: { priceMinor: BigInt(plan.price), isActive: plan.active },
            });
          }
          if (command.type === "rules")
            await tx.findLoveAdminSettings.update({
              where: { id: "global" },
              data: {
                permissions: JSON.parse(JSON.stringify(next.permissions)),
              },
            });
          if (command.type === "checkout") {
            if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{4,127}$/.test(command.reason))
              throw AppError.validation({
                reference: [
                  "Enter the external transaction reference only (5–128 characters, no spaces)",
                ],
              });
            const referenceHash = createHash("sha256")
              .update(command.reason.toLowerCase())
              .digest("hex");
            if (
              await tx.paymentIntent.findFirst({
                where: {
                  provider: "admin_recorded",
                  providerTransactionId: referenceHash,
                },
              })
            )
              throw AppError.conflict(
                ERROR_CODES.VALIDATION_FAILED,
                "This transaction reference has already been recorded.",
              );
            const payment = next.payments.find(
              (p) => p.id === input.requestId,
            )!;
            const owner = await tx.user.findUniqueOrThrow({
              where: { id: payment.memberId },
            });
            const native = (await tx.installmentPlan.findMany()).find(
              (p) => planId(p) === payment.plan.id,
            )!;
            await tx.paymentIntent.create({
              data: {
                id: payment.id,
                reference: `ADM-${payment.id.replaceAll("-", "").slice(0, 28)}`,
                userId: payment.memberId,
                purpose: "FINDLOVE",
                accountType:
                  payment.plan.tier === "private" ? "PRIVATE" : "PUBLIC",
                installmentPlanId: native.id,
                amountMinor: BigInt(payment.amount),
                currency: "RWF",
                paymentMethod:
                  payment.method === "MTN MoMo" ? "MTN_MOMO" : "AIRTEL_MONEY",
                phoneNumber: owner.phone ?? "",
                provider: "admin_recorded",
                providerTransactionId: referenceHash,
                status:
                  payment.status === "success"
                    ? "SUCCEEDED"
                    : payment.status === "pending"
                      ? "AWAITING_USER"
                      : "FAILED",
                expiresAt: new Date(now.getTime() + 30 * 86400000),
                paidAt: payment.status === "success" ? now : null,
                planSnapshot: JSON.parse(
                  JSON.stringify({
                    plan: payment.plan,
                    permissions: payment.permissions,
                  }),
                ),
              },
            });
          }
          if (command.type === "settle") {
            const native = await tx.paymentIntent.findUniqueOrThrow({
              where: { id: command.id },
            });
            if (native.provider !== "admin_recorded")
              throw AppError.conflict(
                ERROR_CODES.VALIDATION_FAILED,
                "Gateway payments must be confirmed by the payment provider.",
              );
            const payment = next.payments.find((p) => p.id === command.id)!;
            await tx.paymentIntent.update({
              where: { id: command.id },
              data: {
                status: payment.status === "success" ? "SUCCEEDED" : "FAILED",
                paidAt: payment.status === "success" ? now : null,
              },
            });
          }
          const modifiedMember =
            command.type === "member" ||
            command.type === "verify" ||
            command.type === "checkout"
              ? next.members.find((m) => m.id === command.id)
              : command.type === "settle"
                ? next.members.find(
                    (m) =>
                      m.id ===
                      next.payments.find((p) => p.id === command.id)!.memberId,
                  )
                : command.type === "report"
                  ? next.members.find(
                      (m) =>
                        m.id ===
                        next.reports.find((r) => r.id === command.id)!.memberId,
                    )
                  : undefined;
          if (modifiedMember) {
            if (
              modifiedMember.id === actorId &&
              modifiedMember.account !== "active"
            )
              throw AppError.validation({
                account: ["An administrator cannot restrict their own account"],
              });
            await tx.user.update({
              where: { id: modifiedMember.id },
              data: {
                status:
                  modifiedMember.account === "active" ? "ACTIVE" : "INACTIVE",
                adminAccountStatus: modifiedMember.account,
              },
            });
            if (
              (command.type === "member" &&
                ["grant", "extend", "revoke"].includes(command.action)) ||
              ((command.type === "checkout" || command.type === "settle") &&
                next.payments.find(
                  (p) =>
                    p.id ===
                    (command.type === "checkout"
                      ? input.requestId
                      : command.id),
                )?.status === "success")
            ) {
              const membership = modifiedMember.membership!;
              const native = (await tx.installmentPlan.findMany()).find(
                (p) => planId(p) === membership.planId,
              );
              if (!native) throw AppError.notFound("Membership plan");
              const previous = await tx.serviceSubscription.findFirst({
                where: {
                  userId: modifiedMember.id,
                  service: "FINDLOVE",
                  revokedAt: null,
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              });
              const data = {
                accountType:
                  membership.tier === "private"
                    ? ("PRIVATE" as const)
                    : ("PUBLIC" as const),
                installmentPlanId: native.id,
                startsAt: new Date(membership.startsAt),
                expiresAt: new Date(membership.expiresAt),
                priceMinor: BigInt(membership.price),
                permissionsSnapshot: JSON.parse(
                  JSON.stringify(membership.permissions),
                ),
                revokedAt: membership.status === "revoked" ? now : null,
              };
              if (
                command.type === "checkout" ||
                command.type === "settle" ||
                (command.type === "member" && command.action === "grant")
              ) {
                await tx.serviceSubscription.updateMany({
                  where: {
                    userId: modifiedMember.id,
                    service: "FINDLOVE",
                    revokedAt: null,
                  },
                  data: { revokedAt: now },
                });
                await tx.serviceSubscription.create({
                  data: {
                    ...data,
                    userId: modifiedMember.id,
                    service: "FINDLOVE",
                    ...(command.type === "checkout" || command.type === "settle"
                      ? {
                          paymentIntentId:
                            command.type === "checkout"
                              ? input.requestId
                              : command.id,
                        }
                      : {}),
                  },
                });
              } else if (
                command.type === "member" &&
                command.action === "revoke"
              ) {
                await tx.serviceSubscription.updateMany({
                  where: {
                    userId: modifiedMember.id,
                    service: "FINDLOVE",
                    revokedAt: null,
                  },
                  data: { revokedAt: now },
                });
              } else if (previous)
                await tx.serviceSubscription.update({
                  where: { id: previous.id },
                  data,
                });
              else
                await tx.serviceSubscription.create({
                  data: {
                    ...data,
                    userId: modifiedMember.id,
                    service: "FINDLOVE",
                  },
                });
            }
            if (command.type === "verify") {
              const latest = await tx.ageVerification.findFirst({
                where: { userId: modifiedMember.id },
                orderBy: { submittedAt: "desc" },
              });
              if (!latest)
                throw AppError.validation({
                  verification: [
                    "No submitted verification case exists for this member",
                  ],
                });
              const status =
                command.decision === "verified"
                  ? "VERIFIED"
                  : command.decision === "rejected"
                    ? "REJECTED"
                    : command.decision === "resubmission_required"
                      ? "FAILED"
                      : "MANUAL_REVIEW";
              await tx.ageVerification.update({
                where: { id: latest.id },
                data: {
                  status,
                  reviewedAt: now,
                  reviewedBy: actorId,
                  rejectionReason:
                    command.decision === "verified" ? null : command.reason,
                  dateOfBirth: new Date(modifiedMember.dob + "T00:00:00Z"),
                },
              });
            }
          }
          if (command.type === "report")
            await tx.userReport.update({
              where: { id: command.id },
              data: {
                status:
                  command.decision === "dismiss" ? "DISMISSED" : "REVIEWED",
                reviewedAt: now,
                reviewedBy: actorId,
              },
            });
          const entry = next.audit[0]!;
          await tx.auditLog.create({
            data: {
              actorId,
              actorRole: "admin",
              action: `findlove.admin.${entry.action}`,
              subjectType: "FindLove",
              changes: {
                reason: entry.reason,
                details: entry.details,
                target: entry.target,
              },
            },
          });
          await tx.findLoveAdminSettings.update({
            where: { id: "global" },
            data: { revision: { increment: 1 } },
          });
          const response = await this.snapshot(tx);
          await tx.idempotencyKey.create({
            data: {
              key: input.requestId,
              endpoint: "admin/findlove",
              requestHash: hash,
              status: "COMPLETED",
              responseStatus: 200,
              responseBody: { revision: response.revision },
            },
          });
          return response;
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
          "Another action completed concurrently. Reload before retrying.",
        );
      throw error;
    }
  }
}
