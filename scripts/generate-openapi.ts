/**
 * Generates an OpenAPI document from the Zod contracts.
 *
 *   bun run openapi > openapi.json
 *
 * Generated from @eventis/contracts rather than from controller decorators, so the
 * published document and the code that validates requests cannot drift apart — they
 * are the same schemas. This also keeps class-validator and class-transformer out of
 * the dependency tree entirely.
 */
import {
  category,
  eventDetail,
  eventSummary,
  order,
  orderPaymentState,
  ticket,
  remoteConfig,
} from '@eventis/contracts';
import { z } from 'zod';

const schemas = {
  Category: category,
  EventSummary: eventSummary,
  EventDetail: eventDetail,
  Order: order,
  OrderPaymentState: orderPaymentState,
  Ticket: ticket,
  RemoteConfig: remoteConfig,
} satisfies Record<string, z.ZodType>;

const components = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [
    name,
    z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' }),
  ]),
);

process.stdout.write(
  JSON.stringify(
    {
      openapi: '3.0.3',
      info: {
        title: 'Eventis API',
        version: '1.0.0',
        description:
          'Event discovery, listing, ticketing and check-in. Schemas are generated from ' +
          '@eventis/contracts, which is also what the API validates against.',
      },
      servers: [{ url: 'https://api.eventis.rw/api/v1' }],
      paths: {},
      components: { schemas: components },
    },
    null,
    2,
  ) + '\n',
);
