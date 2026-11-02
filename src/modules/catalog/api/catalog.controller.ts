import type { Category as CategoryContract } from '@eventis/contracts';
import { Controller, Get, Param } from '@nestjs/common';

import { CatalogService } from '../application/catalog.service.js';
import { toCategoryContract } from '../mappers/category.mapper.js';

/**
 * TRANSPORT LAYER. Thin by design: validate, call the service, map, return.
 *
 * There is no business logic here and there must never be any. A controller that
 * makes a decision is a decision that cannot be tested without an HTTP request and
 * cannot be reused by a worker.
 *
 * This controller may not import anything from infrastructure/ — ESLint enforces it.
 */
@Controller({ path: 'categories', version: '1' })
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  async list(): Promise<CategoryContract[]> {
    const categories = await this.catalog.listCategories();
    return categories.map(toCategoryContract);
  }

  @Get(':slug')
  async bySlug(@Param('slug') slug: string): Promise<CategoryContract> {
    return toCategoryContract(await this.catalog.getCategoryBySlug(slug));
  }
}
