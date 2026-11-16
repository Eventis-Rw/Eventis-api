import { Injectable } from "@nestjs/common";

import {
  AdminCatalogRepository,
  type VersionedCatalog,
} from "../infrastructure/admin-catalog.repository.js";
@Injectable()
export class AdminCatalogService {
  constructor(private readonly repository: AdminCatalogRepository) {}
  read() {
    return this.repository.read();
  }
  save(body: unknown, actorId: string) {
    return this.repository.save(body as VersionedCatalog, actorId);
  }
}
