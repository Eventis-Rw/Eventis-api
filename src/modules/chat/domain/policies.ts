import { eventisPolicy } from "./eventis.policy.js";
import { findLovePolicy } from "./findlove.policy.js";
import type { MessagingPolicy, MessagingService } from "./messaging-policy.js";

export const messagingPolicies: Record<MessagingService, MessagingPolicy> = {
  FINDLOVE: findLovePolicy,
  EVENTIS: eventisPolicy,
};
