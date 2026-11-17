import { PrismaClient } from '@prisma/client';

const database = new URL(process.env.DATABASE_URL ?? 'file:///missing');
if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)
    || database.port !== '5433' || database.pathname !== '/eventis_api_dev') {
  throw new Error('Social seeding is restricted to local eventis_api_dev on port 5433.');
}
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const id = (prefix, number) => `${prefix}-0000-4000-8000-${String(number).padStart(12, '0')}`;
const organisers = [
  ['Sunset Sessions (Demo)', 'music', 'Live music and acoustic events', 'photo-1501386761578-eac5c94b800a', 'A little preview of our next music evening. Demo story.'],
  ['Kigali Sports Club (Demo)', 'sports', 'Community sports and outdoor activities', 'photo-1574629810360-7efbbe195018', 'Getting ready for a friendly football weekend. Demo story.'],
  ['Kigali Food Collective (Demo)', 'food', 'Food markets and community dining', 'photo-1555939594-58d7cb561ad1', 'Fresh flavours and good company at our next food market. Demo story.'],
  ['Tech Builders Kigali (Demo)', 'tech', 'Developer meetups and technology workshops', 'photo-1519389950473-47ba0277781c', 'Bring your ideas to our next builders meetup. Demo story.'],
  ['Kigali Business Circle (Demo)', 'business', 'Business networking and entrepreneur events', 'photo-1511795409834-ef04bbd61622', 'Meet other founders over breakfast. Demo story.'],
];
const now = new Date();
const minutesAgo = value => new Date(now.getTime() - value * 60000);
try {
  const result = await prisma.$transaction(async tx => {
    const result = { organisers: 0, activeStories: 0 };
    for (const [index, sample] of organisers.entries()) {
      const number = index + 1;
      const [name, slug, activities, photo, caption] = sample;
      const userId = id('de100000', number);
      const organisationId = id('de200000', number);
      const image = `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=1000&q=75`;
      const profile = {
        firstName: name, displayName: name, organizationName: name,
        organizationDescription: 'Demo organiser for local testing.',
        accountType: 'POSTER', posterKind: 'BUSINESS', location: 'Kigali',
        avatarUrl: `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=160&q=70`,
        bio: 'Demo organiser for local testing.',
      };
      await tx.user.upsert({
        where: { id: userId },
        create: { id: userId, phone: `+25078000910${number}`, ...profile }, update: profile,
      });
      await tx.organisation.upsert({
        where: { id: organisationId },
        create: { id: organisationId, ownerId: userId, name, description: 'Demo organisation for local testing.', activities, location: 'Kigali', logoKey: profile.avatarUrl },
        update: { name, activities, logoKey: profile.avatarUrl },
      });
      await tx.organisationMember.upsert({
        where: { organisationId_userId: { organisationId, userId } },
        create: { organisationId, userId, role: 'OWNER' }, update: {},
      });
      await tx.user.update({ where: { id: userId }, data: { activeOrganisationId: organisationId } });
      await tx.publisherProfile.upsert({ where: { userId }, create: { userId, legalName: name }, update: {} });
      const category = await tx.category.findUnique({ where: { slug }, select: { id: true } });
      if (category) await tx.publisherProfileCategory.upsert({
        where: { userId_categoryId: { userId, categoryId: category.id } },
        create: { userId, categoryId: category.id }, update: {},
      });
      const demoEventId = id('de000000', number);
      const event = await tx.event.findUnique({ where: { eventId: demoEventId }, select: { tags: true } });
      const eventId = event?.tags.includes('demo') ? demoEventId : null;
      if (eventId) await tx.event.update({ where: { eventId }, data: { posterId: userId, organisationId } });
      const story = {
        userId, eventId, mediaUrl: image, mediaType: 'image', caption,
        background: '#101827', fit: 'cover', overlays: [],
        createdAt: minutesAgo(number), expiresAt: new Date(minutesAgo(number).getTime() + 24 * 60 * 60000),
      };
      await tx.status.upsert({ where: { id: id('de300000', number) }, create: { id: id('de300000', number), ...story }, update: story });
      result.organisers++;
      result.activeStories++;
    }
    return result;
  }, { timeout: 20000 });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
