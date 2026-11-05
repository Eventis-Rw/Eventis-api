import type { StartLiveRequest } from '@eventis/contracts';
import { describe, expect, it } from 'bun:test';

import {
  claimQueue,
  emptyDirectory,
  LIVE_POLICY,
  ownQueue,
  ownRoom,
  pruneDirectory,
  startDirectoryRoom,
} from './live-directory.js';
const now = 1000000;
const draft = (n: number): StartLiveRequest => ({
  requestId: `privateoperation${String(n).padStart(5, '0')}`,
  title: `Soundcheck ${n}`,
  host: { id: `user-${n}`, name: 'Host' },
  mode: 'video',
  chatEnabled: true,
});
const publicId = (n: number) => `publicroom${String(n).padStart(22, '0')}`;
describe('Live directory lifecycle', () => {
  it('reserves at most five slots and queues the next host without going live', () => {
    const state = emptyDirectory();
    for (let n = 0; n < 6; n++)
      startDirectoryRoom(state, draft(n), `proof-${n}`, now, publicId(n));
    expect(state.rooms.length).toBe(5);
    expect(state.queue.length).toBe(1);
    expect(state.rooms.every((r) => !r.live)).toBe(true);
  });
  it('retries are idempotent and a second operation cannot create another Live for the account', () => {
    const state = emptyDirectory();
    const first = startDirectoryRoom(
      state,
      draft(1),
      'proof',
      now,
      publicId(1),
    );
    expect(
      startDirectoryRoom(state, draft(1), 'proof', now + 1, publicId(1)),
    ).toBe(first);
    expect(state.rooms.length).toBe(1);
    expect(() =>
      startDirectoryRoom(
        state,
        { ...draft(2), host: draft(1).host },
        'other',
        now,
        publicId(2),
      ),
    ).toThrow('already');
    expect(() => ownRoom(state, publicId(1), 'attacker')).toThrow(
      'Only the host',
    );
  });
  it('never exposes private request IDs as room IDs or transport names', () => {
    const state = emptyDirectory();
    const result = startDirectoryRoom(
      state,
      draft(1),
      'proof',
      now,
      publicId(1),
    );
    if (!('listing' in result)) throw Error('Expected room');
    expect(result.listing.id).toBe(publicId(1));
    expect(result.roomName).not.toContain(draft(1).requestId);
    expect(result.listing.host.id).toBe('user-1');
  });
  it('expires abandoned/preparing rooms and absolute duration independently', () => {
    const state = emptyDirectory();
    startDirectoryRoom(state, draft(1), 'proof', now, publicId(1));
    expect(pruneDirectory(state, now + LIVE_POLICY.leaseMs).rooms.length).toBe(
      0,
    );
    state.rooms[0]!.listing.availableUntil =
      now + LIVE_POLICY.durationMs + 5000;
    expect(
      pruneDirectory(state, now + LIVE_POLICY.durationMs).rooms.length,
    ).toBe(0);
  });
  it('preserves FIFO queue and requires manual claim after a slot opens', () => {
    const state = emptyDirectory();
    for (let n = 0; n < 7; n++)
      startDirectoryRoom(state, draft(n), `p${n}`, now, publicId(n));
    expect(() => claimQueue(state, publicId(6), 'p6', now)).toThrow('Wait');
    state.rooms.shift();
    expect(state.rooms.length).toBe(4);
    expect(state.queue.length).toBe(2);
    expect(() => ownQueue(state, publicId(5), 'attacker')).toThrow(
      'another device',
    );
    const claimed = claimQueue(state, publicId(5), 'p5', now);
    expect(claimed.live).toBe(false);
    expect(state.rooms.length).toBe(5);
    expect(state.queue[0]!.id).toBe(publicId(6));
    expect(claimQueue(state, publicId(5), 'p5', now)).toBe(claimed);
  });
  it('expires absent queued hosts and prevents resurrection by a delayed start retry', () => {
    const state = emptyDirectory();
    startDirectoryRoom(state, draft(1), 'proof', now, publicId(1));
    const expired = pruneDirectory(state, now + LIVE_POLICY.leaseMs);
    expect(() =>
      startDirectoryRoom(
        expired,
        draft(1),
        'proof',
        now + LIVE_POLICY.leaseMs,
        publicId(1),
      ),
    ).toThrow('finished');
    for (let n = 2; n < 8; n++)
      startDirectoryRoom(state, draft(n), 'p', now, publicId(n));
    expect(
      pruneDirectory(state, now + LIVE_POLICY.queueLeaseMs).queue.length,
    ).toBe(0);
  });
});
