import { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import {
  entities,
  alerts,
  timeRanges,
  entitySelectors,
} from "../schema";
import { getClosestSnapshot } from "./utils";

export async function alertsHandler(c: Context) {
  const db = drizzle(c.env.DATABASE);
  const providerId = c.req.param("provider");
  const atParam = c.req.query("at");

  let targetTime: Date | undefined;
  if (atParam) {
    targetTime = new Date(atParam);
    if (isNaN(targetTime.getTime())) {
      return c.json({ error: "Invalid date format for 'at' parameter" }, 400);
    }
  }

  // Find closest snapshot
  const snapshot = await getClosestSnapshot(db, providerId, targetTime);
  if (!snapshot) {
    return c.json(
      {
        error: "No snapshot found within 1 minute of target time",
        provider: providerId,
        targetTime: targetTime?.toISOString(),
      },
      404,
    );
  }

  // Get all alert entities for this snapshot
  const alertEntities = await db
    .select()
    .from(entities)
    .where(eq(entities.snapshotId, snapshot.id))
    .innerJoin(alerts, eq(entities.alertId, alerts.id));

  // Fetch related data for each alert
  const results = await Promise.all(
    alertEntities.map(async (row) => {
      const alert = row.alerts;
      const entity = row.entities;

      // Get active periods
      const activePeriods = await db
        .select()
        .from(timeRanges)
        .where(eq(timeRanges.alertId, alert.id));

      // Get informed entities
      const informedEntities = await db
        .select()
        .from(entitySelectors)
        .where(eq(entitySelectors.alertId, alert.id));

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
    }),
  );

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
