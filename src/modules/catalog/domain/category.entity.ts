/**
 * DOMAIN LAYER.
 *
 * Pure. No database, no Nest, no HTTP, no clock reads. Everything here is a value or
 * a rule you can test by calling it with arguments.
 *
 * If you find yourself wanting to import a repository here, the logic belongs in
 * application/ instead. ESLint enforces this — the rule is the design.
 */

export interface Category {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly iconKey: string | null;
  readonly position: number;
}

/**
 * Display order: explicit position first, then alphabetical as a stable tiebreak.
 *
 * The tiebreak matters. Without it two categories sharing a position swap places
 * between requests, the list visibly reshuffles, and someone files a bug that is
 * very hard to reproduce.
 */
export function compareForDisplay(a: Category, b: Category): number {
  if (a.position !== b.position) return a.position - b.position;
  return a.name.localeCompare(b.name);
}

export function sortForDisplay(categories: readonly Category[]): Category[] {
  return [...categories].sort(compareForDisplay);
}
