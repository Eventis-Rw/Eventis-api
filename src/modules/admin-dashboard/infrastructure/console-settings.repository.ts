import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { AppError } from "../../../common/errors/app-error.js";
import { PrismaService } from "../../../infrastructure/database/prisma.service.js";

type GlobalSettings = {
  revision: number;
  displayName: string;
  supportEmail: string | null;
  announcement: string | null;
};

const global = { id: "global" };
const conflict = (message: string) =>
  AppError.conflict(ERROR_CODES.VALIDATION_FAILED, message);

@Injectable()
export class ConsoleSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  read() {
    return this.prisma.eventisGlobalSettings.findUniqueOrThrow({
      where: global,
    });
  }

  save({ revision, ...settings }: GlobalSettings, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.eventisGlobalSettings.updateMany({
        where: { ...global, revision },
        data: { ...settings, revision: { increment: 1 } },
      });
      if (!count)
        throw conflict("Settings have changed. Reload and try again.");
      await this.audit(
        tx,
        actorId,
        "eventis.settings.update",
        "eventis_settings",
        null,
        { revision: revision + 1 },
      );
      return tx.eventisGlobalSettings.findUniqueOrThrow({ where: global });
    });
  }

  async listRoles() {
    const [roles, administrators] = await Promise.all([
      this.prisma.consoleRole.findMany({ orderBy: { name: "asc" } }),
      this.prisma.user.findMany({
        where: { role: "ADMIN", deletedAt: null },
        select: {
          id: true,
          displayName: true,
          phone: true,
          consoleRoleId: true,
        },
        orderBy: { id: "asc" },
      }),
    ]);
    return { roles, administrators };
  }

  saveRole(
    id: string | null,
    input: { name: string; permissions: string[] },
    actorId: string,
  ) {
    const data = {
      name: input.name,
      permissions: [...new Set(input.permissions)],
    };
    return this.manageRoles(actorId, async (tx) => {
      const role = id
        ? await tx.consoleRole.update({ where: { id }, data })
        : await tx.consoleRole.create({ data });
      await this.audit(
        tx,
        actorId,
        id ? "console.role.update" : "console.role.create",
        "console_role",
        role.id,
        data,
      );
      return role;
    });
  }

  deleteRole(id: string, actorId: string) {
    return this.manageRoles(actorId, async (tx) => {
      await tx.consoleRole.delete({ where: { id } });
      await this.audit(
        tx,
        actorId,
        "console.role.delete",
        "console_role",
        id,
        {},
      );
      return { deleted: true };
    });
  }

  assign(id: string, roleId: string | null, actorId: string) {
    if (id === actorId)
      throw AppError.forbidden("You cannot change your own console role.");
    return this.manageRoles(actorId, async (tx) => {
      if (
        roleId &&
        !(await tx.consoleRole.findUnique({
          where: { id: roleId },
          select: { id: true },
        }))
      ) {
        throw AppError.notFound("That console role");
      }
      const { count } = await tx.user.updateMany({
        where: { id, role: "ADMIN", deletedAt: null },
        data: { consoleRoleId: roleId },
      });
      if (!count) throw AppError.notFound("That administrator");
      await this.audit(tx, actorId, "console.role.assign", "user", id, {
        roleId,
      });
      return { id, roleId };
    });
  }

  private async manageRoles<T>(
    actorId: string,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const actor = await tx.user.findFirst({
            where: {
              id: actorId,
              role: "ADMIN",
              status: "ACTIVE",
              deletedAt: null,
              consoleRoleId: null,
            },
            select: { id: true },
          });
          if (!actor)
            throw AppError.forbidden(
              "Unrestricted administrator access is required.",
            );
          return action(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
      if (error.code === "P2002")
        throw conflict("A role with that name already exists.");
      if (error.code === "P2003")
        throw conflict(
          "Remove this role from every administrator before deleting it.",
        );
      if (error.code === "P2025") throw AppError.notFound("That console role");
      if (error.code === "P2034")
        throw conflict("Roles changed concurrently. Reload and try again.");
      throw error;
    }
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    subjectType: string,
    subjectId: string | null,
    changes: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: {
        actorId,
        actorRole: "admin",
        action,
        subjectType,
        subjectId,
        changes,
      },
    });
  }
}
