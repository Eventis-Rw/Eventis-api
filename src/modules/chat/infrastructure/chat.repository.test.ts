import { expect, mock, test } from "bun:test";

import { ChatRepository } from "./chat.repository.js";

test("an inbox page counts unread messages together using each participant's read time", async () => {
  const lastReadAt = new Date("2026-11-23T12:00:00Z");
  const rows = [
    { id: "first", messages: [], participants: [{ userId: "self", lastReadAt }] },
    { id: "second", messages: [], participants: [{ userId: "self", lastReadAt: null }] },
  ];
  const groupBy = mock(() => Promise.resolve([{ conversationId: "second", _count: { _all: 3 } }]));
  const repository = new ChatRepository({
    conversation: { findMany: () => Promise.resolve(rows), count: () => Promise.resolve(2) },
    message: { groupBy },
  } as never);

  const page = await repository.listConversationsForUser({
    userId: "self", service: "EVENTIS", archived: false, page: 1, limit: 10,
  });
  expect(page.items.map(item => item.unreadCount)).toEqual([0, 3]);
  expect(groupBy).toHaveBeenCalledTimes(1);
  expect(groupBy).toHaveBeenCalledWith({
    by: ["conversationId"], _count: { _all: true },
    where: {
      deletedAt: null, senderId: { not: "self" },
      OR: [{ conversationId: "first", createdAt: { gt: lastReadAt } }, { conversationId: "second" }],
    },
  });
});
