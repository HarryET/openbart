import { Hono } from "hono";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createDb } from "../../../db/client";
import {
  alertInformedEntities,
  alerts,
  alertVersions,
} from "../../../db/schema";
import { errorResponse, parsePagination } from "../lib/response";
import type { AppEnv } from "../app";

export const alertRoutes = new Hono<AppEnv>();

alertRoutes.get("/", async (c) => {
  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const { offset, limit } = parsePagination(url.searchParams);
  const routeIdFilter = url.searchParams.get("route_id");
  const stopIdFilter = url.searchParams.get("stop_id");
  const includeExpired = url.searchParams.get("include_expired") === "true";

  const conditions = [];
  if (!includeExpired) conditions.push(isNull(alerts.deletedAt));

  // If filtering by route/stop, narrow to alert IDs matching informed entities
  if (routeIdFilter || stopIdFilter) {
    const entityConds = [];
    if (routeIdFilter) entityConds.push(eq(alertInformedEntities.routeId, routeIdFilter));
    if (stopIdFilter) entityConds.push(eq(alertInformedEntities.stopId, stopIdFilter));
    const matching = await db
      .selectDistinct({ alertId: alertInformedEntities.alertId })
      .from(alertInformedEntities)
      .where(and(...entityConds));
    const ids = matching.map((m) => m.alertId);
    if (ids.length === 0) {
      return c.json({ items: [], pagination: { offset, limit, total: 0 } });
    }
    conditions.push(inArray(alerts.id, ids));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(alerts)
      .where(whereClause)
      .orderBy(desc(alerts.updatedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(alerts)
      .where(whereClause),
  ]);

  // Attach informed entities
  const alertIds = rows.map((r) => r.id);
  const entitiesByAlert = new Map<number, typeof alertInformedEntities.$inferSelect[]>();
  if (alertIds.length > 0) {
    const entities = await db
      .select()
      .from(alertInformedEntities)
      .where(inArray(alertInformedEntities.alertId, alertIds));
    for (const e of entities) {
      const list = entitiesByAlert.get(e.alertId) ?? [];
      list.push(e);
      entitiesByAlert.set(e.alertId, list);
    }
  }

  const items = rows.map((r) => ({
    ...r,
    informedEntities: entitiesByAlert.get(r.id) ?? [],
  }));

  c.header("Cache-Control", "public, max-age=60");
  return c.json({ items, pagination: { offset, limit, total } });
});

alertRoutes.get("/:id", async (c) => {
  const db = createDb(c.env);
  const idParam = c.req.param("id");
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return errorResponse(c, "BAD_REQUEST", "Alert id must be numeric");
  }

  const [row] = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
  if (!row) return errorResponse(c, "NOT_FOUND", `Alert '${idParam}' not found`);

  const entities = await db
    .select()
    .from(alertInformedEntities)
    .where(eq(alertInformedEntities.alertId, id));

  const includeHistory = new URL(c.req.url).searchParams.get("include_history") === "true";
  let history: typeof alertVersions.$inferSelect[] = [];
  if (includeHistory) {
    history = await db
      .select()
      .from(alertVersions)
      .where(eq(alertVersions.alertId, id))
      .orderBy(asc(alertVersions.createdAt));
  }

  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    ...row,
    informedEntities: entities,
    ...(includeHistory ? { history } : {}),
  });
});
