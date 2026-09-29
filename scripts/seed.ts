/**
 * Seeds a local database with enough data to exercise the reference Events API.
 *
 * Idempotent: safe to run repeatedly. Categories are seeded for the future catalog
 * module; one sample event demonstrates create/get/update against a populated row.
 */
import { PrismaClient } from "@prisma/client";

import { loadEnv } from "../src/config/env.js";

const CATEGORIES = [
  { slug: "music", name: "Music", iconKey: "music", position: 10 },
  { slug: "nightlife", name: "Nightlife", iconKey: "moon", position: 20 },
  { slug: "tech", name: "Tech", iconKey: "cpu", position: 30 },
  { slug: "business", name: "Business", iconKey: "briefcase", position: 40 },
  { slug: "sports", name: "Sports", iconKey: "activity", position: 50 },
  { slug: "arts", name: "Arts & Culture", iconKey: "palette", position: 60 },
  { slug: "food", name: "Food & Drink", iconKey: "utensils", position: 70 },
  { slug: "faith", name: "Faith", iconKey: "heart", position: 80 },
  { slug: "community", name: "Community", iconKey: "users", position: 90 },
  { slug: "education", name: "Education", iconKey: "book", position: 100 },
];

loadEnv();
const prisma = new PrismaClient();

try {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: {
        name: category.name,
        iconKey: category.iconKey,
        position: category.position,
      },
    });
  }

  const existing = await prisma.event.findFirst({
    where: { title: "Kigali Jazz Night" },
  });

  if (!existing) {
    await prisma.event.create({
      data: {
        title: "Kigali Jazz Night",
        description:
          "An evening of live jazz in Kimihurura. Reference seed event.",
        status: "draft",
        startsAt: new Date("2026-10-15T18:00:00.000Z"),
        endsAt: new Date("2026-10-15T22:00:00.000Z"),
        venueName: "The Hut",
        address: "KG 9 Ave, Kimihurura, Kigali",
      },
    });
  }

  console.warn(
    `seeded ${CATEGORIES.length} categories and the reference event`,
  );
} finally {
  await prisma.$disconnect();
}
