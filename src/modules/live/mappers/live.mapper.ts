import type {
  LiveHostReservation,
  LiveListing,
  LiveQueueTicket,
} from '../../../contracts/index.js';
import {
  LIVE_POLICY,
  type DirectoryState,
  type StoredQueue,
  type StoredRoom,
} from '../domain/live-directory.js';

export function toLiveListing(room: StoredRoom): LiveListing {
  const l = room.listing;
  return {
    id: l.id,
    host: l.host,
    title: l.title,
    mode: l.mode,
    ...(l.event ? { event: l.event } : {}),
    startedAt: l.startedAt,
    endsAt: l.endsAt,
    availableUntil: l.availableUntil,
    viewers: l.viewers,
    chatEnabled: l.chatEnabled,
  };
}
export function toReservation(
  room: StoredRoom,
  token: string,
): LiveHostReservation {
  return {
    kind: 'room',
    listing: toLiveListing(room),
    roomName: room.roomName,
    hostIdentity: room.hostIdentity,
    controlToken: token,
  };
}
export function toQueue(
  ticket: StoredQueue,
  state: DirectoryState,
  token: string,
): LiveQueueTicket {
  const position = state.queue.findIndex((q) => q.id === ticket.id) + 1;
  return {
    kind: 'queue',
    id: ticket.id,
    controlToken: token,
    position,
    ready: position === 1 && state.rooms.length < LIVE_POLICY.capacity,
  };
}
