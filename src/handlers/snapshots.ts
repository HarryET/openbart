import { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { snapshots } from "../schema";

export async function snapshotsHandler(c: Context) {
  const db = drizzle(c.env.DATABASE);
  const providerId = c.req.param("provider");

  // Query parameters
  const page = parseInt(c.req.query("page") || "1");
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100); // Max 100 per page
  const finishedParam = c.req.query("finished");
  const fromParam = c.req.query("from");
  const toParam = c.req.query("to");

  if (page < 1 || limit < 1) {
    return c.json({ error: "Invalid page or limit" }, 400);
  }

  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions = [eq(snapshots.providerId, providerId)];

  // Filter by finished status if specified
  if (finishedParam !== undefined) {
    const finishedValue = finishedParam === "true" || finishedParam === "1" ? 1 : 0;
    conditions.push(eq(snapshots.finished, finishedValue));
  }

  // Filter by date range
  if (fromParam) {
    const fromDate = new Date(fromParam);
    if (isNaN(fromDate.getTime())) {
      return c.json({ error: "Invalid 'from' date format" }, 400);
    }
    conditions.push(gte(snapshots.feedTimestamp, fromDate));
  }

  if (toParam) {
    const toDate = new Date(toParam);
    if (isNaN(toDate.getTime())) {
      return c.json({ error: "Invalid 'to' date format" }, 400);
    }
    conditions.push(lte(snapshots.feedTimestamp, toDate));
  }

  // Get total count for pagination
  const [countResult] = await db
    .select({ count: snapshots.id })
    .from(snapshots)
    .where(and(...conditions));

  const total = countResult?.count || 0;

  // Get paginated results
  const results = await db
    .select({
      id: snapshots.id,
      provider_id: snapshots.providerId,
      feed_timestamp: snapshots.feedTimestamp,
      gtfs_realtime_version: snapshots.gtfsRealtimeVersion,
      incrementality: snapshots.incrementality,
      feed_version: snapshots.feedVersion,
      entities_count: snapshots.entitiesCount,
      finished: snapshots.finished,
    })
    .from(snapshots)
    .where(and(...conditions))
    .orderBy(desc(snapshots.feedTimestamp))
    .limit(limit)
    .offset(offset);

  const totalPages = Math.ceil(total / limit);

  return c.json({
    provider: providerId,
    snapshots: results.map((s) => ({
      id: s.id,
      provider_id: s.provider_id,
      feed_timestamp: s.feed_timestamp,
      gtfs_realtime_version: s.gtfs_realtime_version,
      incrementality: s.incrementality === 0 ? "FULL_DATASET" : "DIFFERENTIAL",
      feed_version: s.feed_version,
      entities_count: s.entities_count,
      finished: s.finished === 1,
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
    },
  });
}
