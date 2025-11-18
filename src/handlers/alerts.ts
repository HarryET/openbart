import { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import {
  entities,
  alerts,
  timeRanges,
  entitySelectors,
} from "../schema";
import { getLatestFinishedSnapshot, getSnapshotById } from "./utils";

export async function alertsHandler(c: Context) {
  const db = drizzle(c.env.DATABASE);
  const providerId = c.req.param("provider");
  const snapshotParam = c.req.query("snapshot");

  let snapshot;
  if (snapshotParam) {
    const snapshotId = parseInt(snapshotParam);
    if (isNaN(snapshotId)) {
      return c.json({ error: "Invalid snapshot ID" }, 400);
    }
    snapshot = await getSnapshotById(db, snapshotId);
    if (!snapshot) {
      return c.json({ error: "Snapshot not found" }, 404);
    }
    if (snapshot.providerId !== providerId) {
      return c.json({ error: "Snapshot does not belong to this provider" }, 400);
    }
  } else {
    snapshot = await getLatestFinishedSnapshot(db, providerId);
    if (!snapshot) {
      return c.json(
        {
          error: "No finished snapshot found",
          provider: providerId,
        },
        404,
      );
    }
  }

  // Get all alert entities for this snapshot
  const alertEntities = await db
    .select()
    .from(entities)
    .where(eq(entities.snapshotId, snapshot.id))
    .innerJoin(alerts, eq(entities.alertId, alerts.id));

  if (alertEntities.length === 0) {
    return c.json({
      snapshot: {
        id: snapshot.id,
        timestamp: snapshot.feedTimestamp,
        version: snapshot.gtfsRealtimeVersion,
        entity_count: snapshot.entitiesCount,
      },
      provider: providerId,
      alerts: [],
    });
  }

  // Fetch related data using JOINs through entities to avoid variable limit
  const [allActivePeriods, allInformedEntities] = await Promise.all([
    db
      .select({
        alertId: alerts.id,
        timeRange: timeRanges,
      })
      .from(entities)
      .innerJoin(alerts, eq(entities.alertId, alerts.id))
      .innerJoin(timeRanges, eq(timeRanges.alertId, alerts.id))
      .where(eq(entities.snapshotId, snapshot.id)),
    db
      .select({
        alertId: alerts.id,
        entitySelector: entitySelectors,
      })
      .from(entities)
      .innerJoin(alerts, eq(entities.alertId, alerts.id))
      .innerJoin(entitySelectors, eq(entitySelectors.alertId, alerts.id))
      .where(eq(entities.snapshotId, snapshot.id)),
  ]);

  // Create lookup maps
  const activePeriodsMap = new Map<number, typeof timeRanges[]>();
  for (const row of allActivePeriods) {
    const key = row.alertId;
    if (!activePeriodsMap.has(key)) {
      activePeriodsMap.set(key, []);
    }
    activePeriodsMap.get(key)!.push(row.timeRange);
  }

  const informedEntitiesMap = new Map<number, typeof entitySelectors[]>();
  for (const row of allInformedEntities) {
    const key = row.alertId;
    if (!informedEntitiesMap.has(key)) {
      informedEntitiesMap.set(key, []);
    }
    informedEntitiesMap.get(key)!.push(row.entitySelector);
  }

  // Build results
  const results = alertEntities.map((row) => {
    const alert = row.alerts;
    const entity = row.entities;

    const activePeriods = activePeriodsMap.get(alert.id) || [];
    const informedEntities = informedEntitiesMap.get(alert.id) || [];

    return {
      entity_id: entity.entityId,
      is_deleted: entity.isDeleted === 1,
      cause: alert.cause,
      effect: alert.effect,
      severity_level: alert.severityLevel,
      url: alert.url ? JSON.parse(alert.url) : null,
      header_text: alert.headerText ? JSON.parse(alert.headerText) : null,
      description_text: alert.descriptionText
        ? JSON.parse(alert.descriptionText)
        : null,
      tts_header_text: alert.ttsHeaderText
        ? JSON.parse(alert.ttsHeaderText)
        : null,
      tts_description_text: alert.ttsDescriptionText
        ? JSON.parse(alert.ttsDescriptionText)
        : null,
      active_periods: activePeriods.map((period) => ({
        start: period.start,
        end: period.end,
      })),
      informed_entities: informedEntities.map((informed) => ({
        agency_id: informed.agencyId,
        route_id: informed.routeId,
        route_type: informed.routeType,
        trip_id: informed.tripId,
        direction_id: informed.directionId,
        stop_id: informed.stopId,
      })),
    };
  });

  return c.json({
    snapshot: {
      id: snapshot.id,
      timestamp: snapshot.feedTimestamp,
      version: snapshot.gtfsRealtimeVersion,
      entity_count: snapshot.entitiesCount,
    },
    provider: providerId,
    alerts: results,
  });
}
