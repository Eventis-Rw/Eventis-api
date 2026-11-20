import { PrismaClient } from '@prisma/client';

// Explicitly limited to the local integration database. Does not send SMS or payments.
const database = new URL(process.env.DATABASE_URL ?? 'file:///missing');
if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)
    || database.port !== '5433' || database.pathname !== '/eventis_api_dev') {
  throw new Error('Feed seeding is restricted to the local eventis_api_dev database on port 5433.');
}

const samples = [
  ['Kigali Sunset Sessions', 'Music', 'music', 'Kimihurura, Kigali', 3, '18:00', '22:00', 5000, 200, 'photo-1501386761578-eac5c94b800a', 'An evening of live music and acoustic performances.'],
  ['Community Football Weekend', 'Sports', 'sports', 'Kicukiro, Kigali', 5, '09:00', '13:00', 0, 120, 'photo-1574629810360-7efbbe195018', 'A friendly football morning for local teams and supporters.'],
  ['Kigali Street Food Market', 'Food', 'food', 'Kimironko, Kigali', 6, '12:00', '19:00', 0, 300, 'photo-1555939594-58d7cb561ad1', 'Discover local dishes, food stalls and an afternoon of community activities.'],
  ['Tech Builders Meetup', 'Tech', 'tech', 'Kacyiru, Kigali', 8, '17:30', '20:30', 0, 80, 'photo-1519389950473-47ba0277781c', 'Meet developers and designers, share demos and discuss ideas for your next project.'],
  ['Entrepreneurs Networking Breakfast', 'Business', 'business', 'Nyarutarama, Kigali', 10, '08:00', '11:00', 10000, 60, 'photo-1511795409834-ef04bbd61622', 'A relaxed networking breakfast with short talks and small business conversations.'],
  ['Rooftop DJ Night', 'Nightlife', 'nightlife', 'Remera, Kigali', 12, '19:00', '23:00', 8000, 150, 'photo-1470225620780-dba8ba36b745', 'An evening of DJ sets, dancing and city views. Adults only.'],
  ['Kigali Community Walk', 'Community', 'community', 'Nyandungu, Kigali', 13, '07:00', '10:00', 0, 100, 'photo-1551632811-561732d1e306', 'A gentle group walk and a chance to meet neighbours. Bring comfortable shoes and water.'],
  ['Sunday Acoustic Picnic', 'Music', 'music', 'Kigali City, Kigali', 20, '14:00', '18:00', 3000, 100, 'photo-1516280440614-37939bbacd81', 'An outdoor afternoon with acoustic music and picnic space for friends and families.'],
];

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Kigali', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const baseDate = new Date(`${today}T00:00:00.000Z`);
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
try {
  const seeded = await prisma.$transaction(async (tx) => {
    const poster = await tx.user.upsert({
      where: { phone: '+250780000001' },
      create: { phone: '+250780000001', firstName: 'Eventis Demo Organiser', displayName: 'Eventis Demo Organiser', accountType: 'POSTER' },
      update: {},
    });
    const result = [];
    for (const [index, sample] of samples.entries()) {
      const [title, category, slug, location, days, time, endTime, price, capacity, photo, description] = sample;
      const categoryRow = await tx.category.upsert({
        where: { slug }, create: { slug, name: category, position: (index + 1) * 10 }, update: {},
      });
      const startDate = new Date(baseDate);
      startDate.setUTCDate(startDate.getUTCDate() + days);
      const eventId = `de000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      const data = {
        title: `${title} (Demo)`,
        description: `${description}\n\nDemo event for local testing. This is not a real event or ticket offer.`,
        coverImage: `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=1000&q=75`,
        category, categoryId: categoryRow.id, location, city: 'Kigali',
        startDate, endDate: startDate, time, endTime, timezone: 'Africa/Kigali',
        status: 'published', capacity, isPaid: price > 0, priceMinor: price > 0 ? BigInt(price) : null,
        currency: 'RWF', bookingUrl: price > 0 ? `https://example.com/demo-events/${eventId}` : null, tags: [slug, 'demo'],
        instructions: 'Local test event only. No real booking or payment is required.',
      };
      const row = await tx.event.upsert({
        where: { eventId }, create: { eventId, posterId: poster.id, ...data }, update: data,
        select: { eventId: true, title: true, status: true, startDate: true },
      });
      result.push(row);
    }
    return result;
  }, { timeout: 15000 });
  console.log(JSON.stringify({ seeded: seeded.length, events: seeded }, null, 2));
} finally {
  await prisma.$disconnect();
}
