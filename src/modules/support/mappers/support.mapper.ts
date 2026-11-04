import type { SupportReport, Upload } from "@prisma/client";

export function toUploadResponse(row: Upload) {
  return {
    id: row.id,
    key: row.key,
    purpose: row.purpose,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    isPrivate: row.isPrivate,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toSupportReportResponse(row: SupportReport) {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    contactEmail: row.contactEmail,
    reference: row.reference,
    screenshotKey: row.screenshotKey,
    diagnostics: row.diagnostics,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
