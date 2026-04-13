import { Hono } from "hono";
import { and, asc, eq, sql } from "drizzle-orm";
import { createDb } from "../../../db/client";
import { routes as routesTable, stops, stopTimes, trips } from "../../../db/schema";
import { errorResponse, parsePagination } from "../lib/response";
import type { AppEnv } from "../app";

export const routeRoutes = new Hono<AppEnv>();

routeRoutes.get("/", async (c) => {
  const db = createDb(c.env);
  const rows = await db.select().from(routesTable).orderBy(asc(routesTable.shortName));
  c.header("Cache-Control", "public, max-age=3600");
  return c.json({
    items: rows,
    pagination: { offset: 0, limit: rows.length, total: rows.length },
  });
});

routeRoutes.get("/:id", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const [row] = await db.select().from(routesTable).where(eq(routesTable.id, id)).limit(1);
  if (!row) return errorResponse(c, "NOT_FOUND", `Route '${id}' not found`);
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(row);
});

routeRoutes.get("/:id/trips", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const url = new URL(c.req.url);
  const { offset, limit } = parsePagination(url.searchParams);
  const directionParam = url.searchParams.get("direction_id");
  const direction =
    directionParam === "0" || directionParam === "1" ? Number(directionParam) : null;

  const conditions = [eq(trips.routeId, id)];
  if (direction !== null) conditions.push(eq(trips.directionId, direction));

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(trips)
      .where(and(...conditions))
      .orderBy(asc(trips.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(trips)
      .where(and(...conditions)),
  ]);

  c.header("Cache-Control", "public, max-age=3600");
  return c.json({ items, pagination: { offset, limit, total } });
});

routeRoutes.get("/:id/stops", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const url = new URL(c.req.url);
  const directionParam = url.searchParams.get("direction_id");
  const direction =
    directionParam === "0" || directionParam === "1" ? Number(directionParam) : null;

  // Pick a representative trip for this route/direction and return its ordered stops.
  const tripConditions = [eq(trips.routeId, id)];
  if (direction !== null) tripConditions.push(eq(trips.directionId, direction));

  const [representative] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(...tripConditions))
    .limit(1);

  if (!representative) {
    return errorResponse(c, "NOT_FOUND", `No trips found for route '${id}'`);
  }

  const rows = await db
    .select({
      stopId: stops.id,
      name: stops.name,
      lat: stops.lat,
      lon: stops.lon,
      stopSequence: stopTimes.stopSequence,
    })
    .from(stopTimes)
    .innerJoin(stops, eq(stopTimes.stopId, stops.id))
    .where(eq(stopTimes.tripId, representative.id))
    .orderBy(asc(stopTimes.stopSequence));

  c.header("Cache-Control", "public, max-age=3600");
  return c.json({ routeId: id, directionId: direction, stops: rows });
});
