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

const INSTALLMENT_PLANS = [
  {
    accountType: "PRIVATE",
    interval: "WEEKLY",
    durationDays: 7,
    priceMinor: 5000n,
  },
  {
    accountType: "PRIVATE",
    interval: "MONTHLY",
    durationDays: 30,
    priceMinor: 15000n,
  },
  {
    accountType: "PRIVATE",
    interval: "YEARLY",
    durationDays: 365,
    priceMinor: 120000n,
  },
  {
    accountType: "PUBLIC",
    interval: "WEEKLY",
    durationDays: 7,
    priceMinor: 8000n,
  },
  {
    accountType: "PUBLIC",
    interval: "MONTHLY",
    durationDays: 30,
    priceMinor: 25000n,
  },
  {
    accountType: "PUBLIC",
    interval: "YEARLY",
    durationDays: 365,
    priceMinor: 200000n,
  },
] as const;

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

  for (const plan of INSTALLMENT_PLANS) {
    await prisma.installmentPlan.upsert({
      where: {
        accountType_interval: {
          accountType: plan.accountType,
          interval: plan.interval,
        },
      },
      create: plan,
      update: {
        durationDays: plan.durationDays,
        priceMinor: plan.priceMinor,
        isActive: true,
      },
    });
  }

  const existing = await prisma.event.findFirst({
    where: { title: "Kigali Jazz Night" },
  });

  const poster = await prisma.user.upsert({
    where: { phone: "+250780000001" },
    create: {
      phone: "+250780000001",
      firstName: "Default Poster",
      accountType: "POSTER",
    },
    update: { accountType: "POSTER" },
  });

  if (!existing) {
    await prisma.event.create({
      data: {
        title: "Kigali Jazz Night",
        description:
          "An evening of live jazz in Kimihurura. Reference seed event.",
        status: "draft",
        startDate: new Date("2026-10-15T00:00:00.000Z"),
        time: "18:00",
        location: "KG 9 Ave, Kimihurura, Kigali",
        posterId: poster.id,
      },
    });
  }

  console.warn(
    `seeded ${CATEGORIES.length} categories, ${INSTALLMENT_PLANS.length} FindLove installment plans and the reference event`,
  );
} finally {
  await prisma.$disconnect();
}
