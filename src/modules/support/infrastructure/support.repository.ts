import { Injectable } from "@nestjs/common";
import type {
  Prisma,
  SupportCategory,
  SupportReport,
  SupportStatus,
  Upload,
  UploadPurpose,
} from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";

@Injectable()
export class SupportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createUpload(input: {
    userId: string;
    key: string;
    purpose: UploadPurpose;
    contentType: string;
    sizeBytes: number;
    isPrivate: boolean;
  }): Promise<Upload> {
    return this.prisma.upload.create({
      data: { ...input, status: "COMPLETE" },
    });
  }

  async findUpload(userId: string, id: string): Promise<Upload | null> {
    return this.prisma.upload.findFirst({ where: { id, userId } });
  }

  async findUploadById(id: string): Promise<Upload | null> {
    return this.prisma.upload.findUnique({ where: { id } });
  }

  async createReport(input: {
    userId: string;
    category: SupportCategory;
    description: string;
    contactEmail: string;
    reference: string | null;
    screenshotKey: string | null;
    diagnostics: Prisma.InputJsonValue;
  }): Promise<SupportReport> {
    return this.prisma.supportReport.create({ data: input });
  }

  async listMine(
    userId: string,
    skip: number,
    take: number,
  ): Promise<{ items: SupportReport[]; total: number }> {
    const where = { userId };
    const [items, total] = await Promise.all([
      this.prisma.supportReport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.supportReport.count({ where }),
    ]);
    return { items, total };
  }

  async listAll(params: {
    skip: number;
    take: number;
    status?: SupportStatus | undefined;
  }): Promise<{ items: SupportReport[]; total: number }> {
    const where: Prisma.SupportReportWhereInput = params.status
      ? { status: params.status }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.supportReport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.supportReport.count({ where }),
    ]);
    return { items, total };
  }

  async updateReportStatus(
    id: string,
    status: SupportStatus,
  ): Promise<SupportReport | null> {
    const existing = await this.prisma.supportReport.findUnique({
      where: { id },
    });
    if (!existing) return null;
    return this.prisma.supportReport.update({
      where: { id },
      data: { status },
    });
  }
}
