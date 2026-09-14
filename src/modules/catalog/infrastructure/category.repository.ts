import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { DB, type Database } from '../../../infra/database/database.module.js';
import { categories } from '../../../infra/database/schema/catalog.js';
import type { Category } from '../domain/category.entity.js';

/**
 * INFRASTRUCTURE LAYER.
 *
 * The only place in this module that imports Drizzle or knows a table exists.
 * It returns DOMAIN types, never raw rows — that boundary is what lets the schema
 * change without touching the service, and what stops an internal column from
 * travelling up to a controller and out to a client.
 */
@Injectable()
export class CategoryRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findAll(): Promise<Category[]> {
    const rows = await this.db
      .select()
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.name));
    return rows.map(toDomain);
  }

  async findBySlug(slug: string): Promise<Category | null> {
    const [row] = await this.db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    return row ? toDomain(row) : null;
  }
}

function toDomain(row: typeof categories.$inferSelect): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    iconKey: row.iconKey,
    position: row.position,
  };
}
