import type { Category as CategoryContract } from '@eventis/contracts';

import type { Category } from '../domain/category.entity.js';

/**
 * The API NEVER returns a database row or a domain object directly.
 *
 * Every response passes through an explicit mapper whose return type comes from
 * @eventis/contracts. The return type annotation is the enforcement: add a field to
 * the domain object and nothing leaks; remove one from the contract and this fails
 * to compile.
 *
 * Returning rows is how an internal `verificationNotes` field ends up on every
 * mobile client in the country.
 */
export function toCategoryContract(category: Category): CategoryContract {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    iconKey: category.iconKey,
  };
}
