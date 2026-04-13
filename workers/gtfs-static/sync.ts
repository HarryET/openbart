import { eq, desc, sql } from "drizzle-orm";
import type { createDb } from "../../db/client";
import {
  agencies,
  routes,
  stops,
  trips,
  stopTimes,
  calendar,
  calendarDates,
  shapes,
  transfers,
  feedInfo,
  gtfsStaticAuditLog,
} from "../../db/schema";
import { fetchGtfsStaticData } from "./fetch";
import {
  extractAgencies,
  extractRoutes,
  extractStops,
  extractTrips,
  extractStopTimes,
  extractCalendar,
  extractCalendarDates,
  extractShapes,
  extractTransfers,
  extractFeedInfo,
} from "./extract";

type Db = ReturnType<typeof createDb>;

export async function syncStaticGtfs(db: Db) {

  console.log("Fetching GTFS static data...");
  const data = await fetchGtfsStaticData();
  console.log("Fetched. Parsing feed info...");

  const feedInfoRows = extractFeedInfo(data.feedInfo);
  const newVersion = feedInfoRows[0]?.feedVersion;
  if (!newVersion) throw new Error("No feed_version in feed_info.txt");

  const [currentFeed] = await db
    .select()
    .from(feedInfo)
    .orderBy(desc(feedInfo.fetchedAt))
    .limit(1);

  if (currentFeed?.feedVersion === newVersion) {
    console.log(`Feed version ${newVersion} already up to date, skipping.`);
    return;
  }

  const oldVersion = currentFeed?.feedVersion ?? null;
  console.log(`Upgrading feed: ${oldVersion ?? "(empty)"} → ${newVersion}`);

  // No transaction wrapper — PlanetScale (Vitess) has a 20s transaction timeout
  // which is too short for bulk inserts. No FK constraints, so atomicity isn't required.

  console.log("Syncing agencies...");
  await syncAgencies(db, extractAgencies(data.agency), oldVersion, newVersion);
  console.log("Syncing calendar...");
  await syncCalendarTable(db, extractCalendar(data.calendar), oldVersion, newVersion);

  console.log("Syncing routes...");
  await syncRoutes(db, extractRoutes(data.routes), oldVersion, newVersion);

  console.log("Syncing stops...");
  await syncStops(db, extractStops(data.stops), oldVersion, newVersion);

  const stopTimesData = extractStopTimes(data.stopTimes);
  console.log(`Clearing stop_times...`);
  const stopTimesOldCount = await deleteAll(db, stopTimes);

  console.log("Syncing trips...");
  await syncTrips(db, extractTrips(data.trips), oldVersion, newVersion);

  console.log(`Inserting ${stopTimesData.length} stop_times...`);
  await batchInsert(db, stopTimes, stopTimesData);
  await writeDeleteAndReinsertAudit(db, "stop_times", stopTimesOldCount, stopTimesData.length, oldVersion, newVersion);

  const shapesData = extractShapes(data.shapes);
  console.log(`Syncing shapes (${shapesData.length} rows)...`);
  await deleteAndReinsert(db, shapes, shapesData, "shapes", oldVersion, newVersion);

  console.log("Syncing calendar_dates...");
  await deleteAndReinsert(db, calendarDates, extractCalendarDates(data.calendarDates), "calendar_dates", oldVersion, newVersion);
  console.log("Syncing transfers...");
  await deleteAndReinsert(db, transfers, extractTransfers(data.transfers), "transfers", oldVersion, newVersion);

  console.log("Recording feed version...");
  await db.insert(feedInfo).values(feedInfoRows[0]);
}

// --- Per-table sync functions for PK-based tables ---

async function syncAgencies(
  db: Db,
  newRows: ReturnType<typeof extractAgencies>,
  oldVersion: string | null,
  newVersion: string,
) {
  const existing = await db.select().from(agencies);
  const existingMap = new Map(existing.map((r) => [r.id, r]));
  const newMap = new Map(newRows.map((r) => [r.id, r]));

  const audit = createAuditTracker();

  for (const [id, row] of newMap) {
    const old = existingMap.get(id);
    if (!old) {
      await db.insert(agencies).values(row);
      audit.added(id, row);
    } else if (rowChanged(old, row)) {
      await db.update(agencies).set(row).where(eq(agencies.id, id));
      audit.modified(id, old, row);
    }
  }
  for (const [id, old] of existingMap) {
    if (!newMap.has(id)) {
      await db.delete(agencies).where(eq(agencies.id, id));
      audit.removed(id, old);
    }
  }

  await writeAudit(db, audit, "agencies", oldVersion, newVersion);
}

async function syncRoutes(
  db: Db,
  newRows: ReturnType<typeof extractRoutes>,
  oldVersion: string | null,
  newVersion: string,
) {
  const existing = await db.select().from(routes);
  const existingMap = new Map(existing.map((r) => [r.id, r]));
  const newMap = new Map(newRows.map((r) => [r.id, r]));

  const audit = createAuditTracker();

  for (const [id, row] of newMap) {
    const old = existingMap.get(id);
    if (!old) {
      await db.insert(routes).values(row);
      audit.added(id, row);
    } else if (rowChanged(old, row)) {
      await db.update(routes).set(row).where(eq(routes.id, id));
      audit.modified(id, old, row);
    }
  }
  for (const [id, old] of existingMap) {
    if (!newMap.has(id)) {
      await db.delete(routes).where(eq(routes.id, id));
      audit.removed(id, old);
    }
  }

  await writeAudit(db, audit, "routes", oldVersion, newVersion);
}

async function syncStops(
  db: Db,
  newRows: ReturnType<typeof extractStops>,
  oldVersion: string | null,
  newVersion: string,
) {
  const existing = await db.select().from(stops);
  const existingMap = new Map(existing.map((r) => [r.id, r]));
  const newMap = new Map(newRows.map((r) => [r.id, r]));

  const audit = createAuditTracker();

  for (const [id, row] of newMap) {
    const old = existingMap.get(id);
    if (!old) {
      await db.insert(stops).values(row);
      audit.added(id, row);
    } else if (rowChanged(old, row)) {
      await db.update(stops).set(row).where(eq(stops.id, id));
      audit.modified(id, old, row);
    }
  }
  for (const [id, old] of existingMap) {
    if (!newMap.has(id)) {
      await db.delete(stops).where(eq(stops.id, id));
      audit.removed(id, old);
    }
  }

  await writeAudit(db, audit, "stops", oldVersion, newVersion);
}

async function syncCalendarTable(
  db: Db,
  newRows: ReturnType<typeof extractCalendar>,
  oldVersion: string | null,
  newVersion: string,
) {
  const existing = await db.select().from(calendar);
  const existingMap = new Map(existing.map((r) => [r.serviceId, r]));
  const newMap = new Map(newRows.map((r) => [r.serviceId, r]));

  const audit = createAuditTracker();

  for (const [id, row] of newMap) {
    const old = existingMap.get(id);
    if (!old) {
      await db.insert(calendar).values(row);
      audit.added(id, row);
    } else if (rowChanged(old, row)) {
      await db.update(calendar).set(row).where(eq(calendar.serviceId, id));
      audit.modified(id, old, row);
    }
  }
  for (const [id, old] of existingMap) {
    if (!newMap.has(id)) {
      await db.delete(calendar).where(eq(calendar.serviceId, id));
      audit.removed(id, old);
    }
  }

  await writeAudit(db, audit, "calendar", oldVersion, newVersion);
}

async function syncTrips(
  db: Db,
  newRows: ReturnType<typeof extractTrips>,
  oldVersion: string | null,
  newVersion: string,
) {
  const existing = await db.select().from(trips);
  const existingMap = new Map(existing.map((r) => [r.id, r]));
  const newMap = new Map(newRows.map((r) => [r.id, r]));

  const audit = createAuditTracker();

  for (const [id, row] of newMap) {
    const old = existingMap.get(id);
    if (!old) {
      await db.insert(trips).values(row);
      audit.added(id, row);
    } else if (rowChanged(old, row)) {
      await db.update(trips).set(row).where(eq(trips.id, id));
      audit.modified(id, old, row);
    }
  }
  for (const [id, old] of existingMap) {
    if (!newMap.has(id)) {
      await db.delete(trips).where(eq(trips.id, id));
      audit.removed(id, old);
    }
  }

  // Trips is a medium table (~2700 rows), only store counts
  await writeAudit(db, audit, "trips", oldVersion, newVersion, false);
}

// --- Helpers for split delete/insert flow (used when FK order matters) ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteAll(db: Db, table: any): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(table);
  await db.delete(table);
  return Number(count);
}

async function batchInsert<T extends Record<string, unknown>>(
  db: Db,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  rows: T[],
) {
  const BATCH_SIZE = 1000;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(table).values(batch as any);
  }
}

async function writeDeleteAndReinsertAudit(
  db: Db,
  tableName: string,
  oldCount: number,
  newCount: number,
  oldVersion: string | null,
  newVersion: string,
) {
  await db.insert(gtfsStaticAuditLog).values({
    feedVersionOld: oldVersion,
    feedVersionNew: newVersion,
    tableName,
    rowsAdded: newCount,
    rowsRemoved: oldCount,
    rowsModified: 0,
    details: null,
  });
}

// --- Delete-and-reinsert for large or non-PK tables ---

async function deleteAndReinsert<T extends Record<string, unknown>>(
  db: Db,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  newRows: T[],
  tableName: string,
  oldVersion: string | null,
  newVersion: string,
) {
  const [{ count: oldCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(table);

  await db.delete(table);

  const BATCH_SIZE = 1000;
  for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
    const batch = newRows.slice(i, i + BATCH_SIZE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(table).values(batch as any);
  }

  await db.insert(gtfsStaticAuditLog).values({
    feedVersionOld: oldVersion,
    feedVersionNew: newVersion,
    tableName,
    rowsAdded: newRows.length,
    rowsRemoved: Number(oldCount),
    rowsModified: 0,
    details: null,
  });
}

// --- Audit helpers ---

type AuditDetail = {
  action: string;
  key: string;
  old?: Record<string, unknown>;
  new?: Record<string, unknown>;
};

function createAuditTracker() {
  let addedCount = 0;
  let removedCount = 0;
  let modifiedCount = 0;
  const details: AuditDetail[] = [];

  return {
    added(key: string, row: Record<string, unknown>) {
      addedCount++;
      details.push({ action: "added", key, new: row });
    },
    removed(key: string, row: Record<string, unknown>) {
      removedCount++;
      details.push({ action: "removed", key, old: row });
    },
    modified(
      key: string,
      old: Record<string, unknown>,
      row: Record<string, unknown>,
    ) {
      modifiedCount++;
      details.push({ action: "modified", key, old, new: row });
    },
    get counts() {
      return {
        added: addedCount,
        removed: removedCount,
        modified: modifiedCount,
      };
    },
    get details() {
      return details;
    },
    get hasChanges() {
      return addedCount > 0 || removedCount > 0 || modifiedCount > 0;
    },
  };
}

async function writeAudit(
  db: Db,
  audit: ReturnType<typeof createAuditTracker>,
  tableName: string,
  oldVersion: string | null,
  newVersion: string,
  includeDetails = true,
) {
  if (!audit.hasChanges) return;

  await db.insert(gtfsStaticAuditLog).values({
    feedVersionOld: oldVersion,
    feedVersionNew: newVersion,
    tableName,
    rowsAdded: audit.counts.added,
    rowsRemoved: audit.counts.removed,
    rowsModified: audit.counts.modified,
    details: includeDetails ? audit.details : null,
  });
}

// --- Row comparison ---

function rowChanged(
  existing: Record<string, unknown>,
  updated: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(updated)) {
    const oldVal = existing[key];
    const newVal = updated[key];
    if ((oldVal ?? null) !== (newVal ?? null)) {
      // Handle numeric string comparison (DB returns string for numeric columns)
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        return true;
      }
    }
  }
  return false;
}
