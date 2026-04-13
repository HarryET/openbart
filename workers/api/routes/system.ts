import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { createDb } from "../../../db/client";
import { agencies, feedInfo, shapes } from "../../../db/schema";
import { errorResponse } from "../lib/response";
import type { AppEnv } from "../app";

export const systemRoutes = new Hono<AppEnv>();

systemRoutes.get("/agencies", async (c) => {
  const db = createDb(c.env);
  const rows = await db.select().from(agencies);
  c.header("Cache-Control", "public, max-age=3600");
  return c.json({
    items: rows,
    pagination: { offset: 0, limit: rows.length, total: rows.length },
  });
});

systemRoutes.get("/agencies/:id", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const [row] = await db.select().from(agencies).where(eq(agencies.id, id)).limit(1);
  if (!row) return errorResponse(c, "NOT_FOUND", `Agency '${id}' not found`);
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(row);
});

systemRoutes.get("/feed-info", async (c) => {
  const db = createDb(c.env);
  const [row] = await db
    .select()
    .from(feedInfo)
    .orderBy(desc(feedInfo.fetchedAt))
    .limit(1);
  if (!row) return errorResponse(c, "NOT_FOUND", "No feed info available");
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(row);
});

systemRoutes.get("/shapes/:shapeId", async (c) => {
  const db = createDb(c.env);
  const shapeId = c.req.param("shapeId");
  const rows = await db
    .select()
    .from(shapes)
    .where(eq(shapes.shapeId, shapeId))
    .orderBy(shapes.shapePtSequence);

  if (rows.length === 0) return errorResponse(c, "NOT_FOUND", `Shape '${shapeId}' not found`);

  const coordinates = rows.map((r) => [Number(r.shapePtLon), Number(r.shapePtLat)]);
  c.header("Cache-Control", "public, max-age=3600");
  return c.json({
    shapeId,
    type: "LineString",
    coordinates,
  });
});
