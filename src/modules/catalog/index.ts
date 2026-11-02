/**
 * The public surface of the catalog module. Nothing else leaves.
 *
 * Other modules call `catalogService.getCategoryBySlug(...)`. They never import the
 * repository, never touch the `categories` table, and never reach past this file.
 * dependency-cruiser fails the build if they try.
 */
export { CatalogModule } from './catalog.module.js';
export { CatalogService } from './application/catalog.service.js';
export type { Category } from './domain/category.entity.js';
