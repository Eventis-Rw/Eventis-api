/**
 * The only file allowed to know which JavaScript runtime this is.
 *
 * ADR 0004 commits us to Bun while keeping Node one line away. That promise is only
 * real if no Bun-specific API leaks into application code — so anything runtime
 * specific goes behind this boundary, and CI runs the suite under both.
 */

export type RuntimeName = 'bun' | 'node';

export function runtimeName(): RuntimeName {
  return typeof globalThis.Bun === 'undefined' ? 'node' : 'bun';
}

export function runtimeVersion(): string {
  return runtimeName() === 'bun' ? (globalThis.Bun?.version ?? 'unknown') : process.versions.node;
}

declare global {
  var Bun: { version: string } | undefined;
}
