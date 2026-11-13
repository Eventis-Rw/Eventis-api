import type {
  Notification,
  UserNotificationPreference,
  UserPreference,
} from "@prisma/client";

export function toPreferenceResponse(
  preference: UserPreference | null,
  categoryIds: string[],
) {
  return {
    preferredLocation: preference?.preferredLocation ?? null,
    latitude: preference?.latitude?.toNumber() ?? null,
    longitude: preference?.longitude?.toNumber() ?? null,
    language: preference?.language ?? null,
    categoryIds,
    updatedAt: preference?.updatedAt.toISOString() ?? null,
  };
}

export function toNotificationPreferenceResponse(
  preference: UserNotificationPreference | null,
) {
  return {
    eventRecommendations: preference?.eventRecommendations ?? true,
    categoryUpdates: preference?.categoryUpdates ?? true,
    eventUpdates: preference?.eventUpdates ?? true,
    savedOrganiserUpdates: preference?.savedOrganiserUpdates ?? true,
    promotional: preference?.promotional ?? false,
    updatedAt: preference?.updatedAt.toISOString() ?? null,
  };
}

export function toNotificationResponse(notification: Notification) {
  return {
    id: notification.id,
    category: notification.category,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}
