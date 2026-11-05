import { z } from 'zod';

const liveImage = z.string().max(1200).refine(v => /^https?:\/\//.test(v) || /^[a-zA-Z0-9_-]{1,80}$/.test(v), 'Use a public image URL or bundled image key');
export const livePerson = z.object({ id: z.string().min(1).max(128), name: z.string().trim().min(1).max(64), avatar: liveImage.optional() });
export const liveEvent = z.object({
  id: z.string().min(1).max(128), title: z.string().trim().min(1).max(90), image: liveImage.optional(),
  date: z.string().max(30), time: z.string().max(30), location: z.string().max(250), description: z.string().max(2000),
  isPaid: z.boolean(), price: z.number().nonnegative().finite(), currency: z.string().max(10),
});
export const startLiveRequest = z.object({
  requestId: z.string().regex(/^[a-z0-9]{16,40}$/), host: livePerson,
  title: z.string().trim().min(1).max(80), mode: z.enum(['video', 'voice']), event: liveEvent.optional(), chatEnabled: z.boolean().default(true),
});
export const liveHeartbeatRequest = z.object({ live: z.boolean(), viewers: z.number().int().min(0).max(1000000) });
export type LiveEventReference = z.infer<typeof liveEvent>;
export type StartLiveRequest = z.infer<typeof startLiveRequest>;
export type LiveHeartbeatRequest = z.infer<typeof liveHeartbeatRequest>;
export interface LiveListing {
  id: string; host: z.infer<typeof livePerson>; title: string; mode: 'video' | 'voice'; event?: LiveEventReference;
  startedAt: number; endsAt: number; availableUntil: number; viewers: number; chatEnabled: boolean;
}
export interface LiveDirectory {
  rooms: LiveListing[]; occupied: number; capacity: number; queueLength: number;
  developmentAccess: boolean; durationMinutes: number; guests: number;
}
export interface LiveHostReservation {
  kind: 'room'; listing: LiveListing; roomName: string; hostIdentity: string; controlToken: string;
}
export interface LiveQueueTicket { kind: 'queue'; id: string; controlToken: string; position: number; ready: boolean; }
export type LiveStartResult = LiveHostReservation | LiveQueueTicket;
export interface LiveWatchSession { listing: LiveListing; roomName: string; hostIdentity: string; }
