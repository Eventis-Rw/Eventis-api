import { Injectable } from "@nestjs/common";
import type {
  Prisma,
  SupportCategory,
  SupportStatus,
  UploadPurpose,
} from "@prisma/client";

import { AppError } from "../../../common/errors/app-error.js";
import { StorageService } from "../../../infrastructure/storage/storage.service.js";
import { SupportRepository } from "../infrastructure/support.repository.js";
import {
  toSupportReportResponse,
  toUploadResponse,
} from "../mappers/support.mapper.js";

const PUBLIC_PURPOSES: UploadPurpose[] = [
  "ORG_LOGO",
  "EVENT_IMAGE",
  "LOVE_PHOTO",
];

@Injectable()
export class SupportService {
  constructor(
    private readonly support: SupportRepository,
    private readonly storage: StorageService,
  ) {}

  async upload(
    userId: string,
    input: {
      purpose: UploadPurpose;
      file: { filename: string; mimetype: string; data: Buffer };
    },
  ) {
    const isPrivate = !PUBLIC_PURPOSES.includes(input.purpose);
    const key = isPrivate
      ? await this.storage.uploadPrivateDocument(
          userId,
          input.purpose,
          input.file,
        )
      : await this.storage.uploadPublicPurposeImage(
          userId,
          input.purpose,
          input.file,
        );
    const row = await this.support.createUpload({
      userId,
      key,
      purpose: input.purpose,
      contentType: input.file.mimetype,
      sizeBytes: input.file.data.length,
      isPrivate,
    });
    return {
      ...toUploadResponse(row),
      url: isPrivate ? null : this.storage.getPublicUrl(key),
    };
  }

  async download(
    userId: string,
    uploadId: string,
    isAdmin: boolean,
  ): Promise<{ data: Buffer; contentType: string }> {
    const row = isAdmin
      ? await this.support.findUploadById(uploadId)
      : await this.support.findUpload(userId, uploadId);
    if (!row) throw AppError.notFound("That upload");
    if (!isAdmin && row.userId !== userId) {
      throw AppError.forbidden();
    }
    if (!row.isPrivate) {
      throw AppError.validation({
        uploadId: ["This upload is public; use its URL directly"],
      });
    }
    const file = await this.storage.getPrivateObject(row.key);
    if (!file) throw AppError.notFound("That upload");
    return file;
  }

  async createReport(
    userId: string,
    input: {
      category: SupportCategory;
      description: string;
      contactEmail: string;
      reference?: string | null | undefined;
      screenshotKey?: string | null | undefined;
      diagnostics?: Record<string, unknown> | undefined;
    },
  ) {
    const row = await this.support.createReport({
      userId,
      category: input.category,
      description: input.description.trim(),
      contactEmail: input.contactEmail.trim(),
      reference: input.reference?.trim() || null,
      screenshotKey: input.screenshotKey?.trim() || null,
      diagnostics: (input.diagnostics ?? {}) as Prisma.InputJsonValue,
    });
    return toSupportReportResponse(row);
  }

  async listMine(
    userId: string,
    input: { page: number; limit: number },
  ) {
    const { items, total } = await this.support.listMine(
      userId,
      (input.page - 1) * input.limit,
      input.limit,
    );
    return {
      items: items.map(toSupportReportResponse),
      page: input.page,
      limit: input.limit,
      total,
    };
  }

  async listAll(input: {
    page: number;
    limit: number;
    status?: SupportStatus | undefined;
  }) {
    const { items, total } = await this.support.listAll({
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      status: input.status,
    });
    return {
      items: items.map(toSupportReportResponse),
      page: input.page,
      limit: input.limit,
      total,
    };
  }

  async updateStatus(id: string, status: SupportStatus) {
    const row = await this.support.updateReportStatus(id, status);
    if (!row) throw AppError.notFound("That support report");
    return toSupportReportResponse(row);
  }
}
