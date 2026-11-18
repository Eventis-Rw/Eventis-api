import { Injectable } from "@nestjs/common";

import { AdminDashboardRepository } from "../infrastructure/admin-dashboard.repository.js";
@Injectable()
export class AdminDashboardService {
  constructor(private readonly repo: AdminDashboardRepository) {}
  photos() {
    return this.repo.photos();
  }
  moderate(...args: Parameters<AdminDashboardRepository["moderate"]>) {
    return this.repo.moderate(...args);
  }
  support() {
    return this.repo.support();
  }
  updateSupport(
    ...args: Parameters<AdminDashboardRepository["updateSupport"]>
  ) {
    return this.repo.updateSupport(...args);
  }
  staff() {
    return this.repo.staff();
  }
  notifications() {
    return this.repo.notifications();
  }
  preview(...args: Parameters<AdminDashboardRepository["preview"]>) {
    return this.repo.preview(...args);
  }
  audit() {
    return this.repo.audit();
  }
  reports() {
    return this.repo.reports();
  }
  resolve(...args: Parameters<AdminDashboardRepository["resolve"]>) {
    return this.repo.resolve(...args);
  }
}
