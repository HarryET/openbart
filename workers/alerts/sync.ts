import { eq, isNull, inArray } from "drizzle-orm";
import type { createDb } from "../../db/client";
import {
  alerts,
  alertInformedEntities,
  alertVersions,
  type InformedEntitySnapshot,
} from "../../db/schema";
import type { FeedAlert } from "./fetch";
import {
  extractAlertContent,
  extractInformedEntities,
  hasContentChanged,
  hasInformedEntitiesChanged,
  type AlertContent,
} from "./extract";

type Db = ReturnType<typeof createDb>;

export async function syncAlerts(
  db: Db,
  feedAlerts: Map<string, FeedAlert>,
) {
  const activeAlerts = await db
    .select()
    .from(alerts)
    .where(isNull(alerts.deletedAt));
  const activeByFeedId = new Map(
    activeAlerts.map((a) => [a.feedEntityId, a]),
  );

  // Load all DB records matching feed IDs (for reappearance detection)
  const feedIds = [...feedAlerts.keys()];
  const knownAlerts =
    feedIds.length > 0
      ? await db
          .select()
          .from(alerts)
          .where(inArray(alerts.feedEntityId, feedIds))
      : [];
  const knownByFeedId = new Map(
    knownAlerts.map((a) => [a.feedEntityId, a]),
  );

  const now = new Date();

  for (const [feedEntityId, feedAlert] of feedAlerts) {
    const existing =
      knownByFeedId.get(feedEntityId) ?? activeByFeedId.get(feedEntityId);
    const content = extractAlertContent(feedAlert);
    const informedEntities = extractInformedEntities(feedAlert);

    if (!existing) {
      await handleNewAlert(db, feedEntityId, content, informedEntities, now);
    } else if (existing.deletedAt) {
      await handleReappearingAlert(
        db,
        existing.id,
        existing,
        content,
        informedEntities,
        now,
      );
    } else {
      await handleContinuingAlert(
        db,
        existing.id,
        existing,
        content,
        informedEntities,
        now,
      );
    }
  }

  await markEndedAlerts(db, activeByFeedId, feedAlerts, now);
}

async function handleNewAlert(
  db: Db,
  feedEntityId: string,
  content: AlertContent,
  informedEntities: InformedEntitySnapshot[],
  now: Date,
) {
  const [inserted] = await db
    .insert(alerts)
    .values({
      feedEntityId,
      ...content,
      createdAt: now,
      updatedAt: now,
    })
    .$returningId();

  await insertInformedEntities(db, inserted.id, informedEntities);
  await insertVersion(db, inserted.id, content, informedEntities, now);
}

async function handleReappearingAlert(
  db: Db,
  alertId: number,
  existing: typeof alerts.$inferSelect,
  content: AlertContent,
  informedEntities: InformedEntitySnapshot[],
  now: Date,
) {
  await db
    .update(alerts)
    .set({ ...content, deletedAt: null, updatedAt: now })
    .where(eq(alerts.id, alertId));

  await replaceInformedEntities(db, alertId, informedEntities);

  const contentDiffers = hasContentChanged(existing, content);
  const entitiesDiffer = await checkInformedEntitiesChanged(
    db,
    alertId,
    informedEntities,
  );

  if (contentDiffers || entitiesDiffer) {
    await insertVersion(db, alertId, content, informedEntities, now);
  }
}

async function handleContinuingAlert(
  db: Db,
  alertId: number,
  existing: typeof alerts.$inferSelect,
  content: AlertContent,
  informedEntities: InformedEntitySnapshot[],
  now: Date,
) {
  const contentDiffers = hasContentChanged(existing, content);
  const entitiesDiffer = await checkInformedEntitiesChanged(
    db,
    alertId,
    informedEntities,
  );

  if (contentDiffers || entitiesDiffer) {
    await db
      .update(alerts)
      .set({ ...content, updatedAt: now })
      .where(eq(alerts.id, alertId));

    await replaceInformedEntities(db, alertId, informedEntities);
    await insertVersion(db, alertId, content, informedEntities, now);
  } else {
    await db
      .update(alerts)
      .set({ updatedAt: now })
      .where(eq(alerts.id, alertId));
  }
}

async function markEndedAlerts(
  db: Db,
  activeByFeedId: Map<string, typeof alerts.$inferSelect>,
  feedAlerts: Map<string, FeedAlert>,
  now: Date,
) {
  const endedIds: number[] = [];
  for (const [feedEntityId, dbAlert] of activeByFeedId) {
    if (!feedAlerts.has(feedEntityId)) {
      endedIds.push(dbAlert.id);
    }
  }

  if (endedIds.length > 0) {
    await db
      .update(alerts)
      .set({ deletedAt: now })
      .where(inArray(alerts.id, endedIds));
  }
}

// --- DB helpers ---

async function checkInformedEntitiesChanged(
  db: Db,
  alertId: number,
  feedEntities: InformedEntitySnapshot[],
): Promise<boolean> {
  const dbEntities = await db
    .select()
    .from(alertInformedEntities)
    .where(eq(alertInformedEntities.alertId, alertId));

  const dbSnapshot: InformedEntitySnapshot[] = dbEntities.map((e) => ({
    agencyId: e.agencyId,
    routeId: e.routeId,
    stopId: e.stopId,
    directionId: e.directionId,
    routeType: e.routeType,
    tripId: e.tripId,
  }));

  return hasInformedEntitiesChanged(dbSnapshot, feedEntities);
}

export async function insertInformedEntities(
  db: Db,
  alertId: number,
  entities: InformedEntitySnapshot[],
) {
  if (entities.length === 0) return;
  await db.insert(alertInformedEntities).values(
    entities.map((e) => ({
      alertId,
      ...e,
    })),
  );
}

export async function replaceInformedEntities(
  db: Db,
  alertId: number,
  entities: InformedEntitySnapshot[],
) {
  await db
    .delete(alertInformedEntities)
    .where(eq(alertInformedEntities.alertId, alertId));
  await insertInformedEntities(db, alertId, entities);
}

export async function insertVersion(
  db: Db,
  alertId: number,
  content: AlertContent,
  informedEntities: InformedEntitySnapshot[],
  createdAt: Date,
) {
  await db.insert(alertVersions).values({
    alertId,
    ...content,
    informedEntities,
    createdAt,
  });
}
