import { Module } from '@nestjs/common';

import { CatalogController } from './api/catalog.controller.js';
import { CatalogService } from './application/catalog.service.js';
import { CategoryRepository } from './infrastructure/category.repository.js';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, CategoryRepository],
  // Only the service leaves. The repository stays private to this module.
  exports: [CatalogService],
})
export class CatalogModule {}
