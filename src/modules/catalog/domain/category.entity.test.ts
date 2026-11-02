import { describe, expect, it } from 'bun:test';

import { sortForDisplay, type Category } from './category.entity.js';

const make = (name: string, position: number): Category => ({
  id: `id-${name}`,
  slug: name.toLowerCase(),
  name,
  iconKey: null,
  position,
});

describe('sortForDisplay', () => {
  it('orders by position first', () => {
    const sorted = sortForDisplay([make('Sports', 2), make('Music', 1)]);
    expect(sorted.map((c) => c.name)).toEqual(['Music', 'Sports']);
  });

  it('breaks a tie alphabetically, so the order never reshuffles between requests', () => {
    const sorted = sortForDisplay([make('Tech', 1), make('Arts', 1), make('Music', 1)]);
    expect(sorted.map((c) => c.name)).toEqual(['Arts', 'Music', 'Tech']);
  });

  it('does not mutate its input', () => {
    const input = [make('Sports', 2), make('Music', 1)];
    sortForDisplay(input);
    expect(input.map((c) => c.name)).toEqual(['Sports', 'Music']);
  });

  it('handles an empty list', () => {
    expect(sortForDisplay([])).toEqual([]);
  });
});
