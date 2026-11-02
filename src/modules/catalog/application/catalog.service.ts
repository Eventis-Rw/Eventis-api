import { Injectable } from '@nestjs/common';

import { AppError } from '../../../common/errors/app-error.js';
import { sortForDisplay, type Category } from '../domain/category.entity.js';
import { CategoryRepository } from '../infrastructure/category.repository.js';

/**
 * APPLICATION LAYER.
 *
 * Orchestrates: calls repositories, applies domain rules, owns the transaction
 * boundary. Knows nothing about HTTP — no status codes, no request objects, no
 * response shapes. That is what makes it callable from a controller, a worker and
 * a test with equal ease.
 *
 * This service is also this module's public surface: other modules call it through
 * `index.ts` and never reach past it.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly categories: CategoryRepository) {}

  async listCategories(): Promise<Category[]> {
    return sortForDisplay(await this.categories.findAll());
  }

  async getCategoryBySlug(slug: string): Promise<Category> {
    const found = await this.categories.findBySlug(slug);
    if (!found) throw AppError.notFound('That category');
    return found;
  }
}
