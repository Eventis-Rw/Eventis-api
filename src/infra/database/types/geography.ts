import { customType } from 'drizzle-orm/pg-core';

/**
 * PostGIS `geography(Point, 4326)`.
 *
 * `geography`, not `geometry`. Geography makes PostGIS do spheroid maths and return
 * **metres**. Geometry returns degrees, and somebody will multiply by 111 and ship it.
 *
 * Reads and writes go through `sql` fragments because PostGIS needs its own
 * constructors — see modules/discovery for the query shape.
 */
export const geographyPoint = customType<{
  data: { lat: number; lng: number };
  driverData: string;
}>({
  dataType: () => 'geography(Point, 4326)',
});
