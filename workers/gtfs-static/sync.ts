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
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function syncStaticGtfs(db: Db) {
  const data = await fetchGtfsStaticData();

  const feedInfoRows = extractFeedInfo(data.feedInfo);
  const newVersion = feedInfoRows[0]?.feedVersion;
  if (!newVersion) throw new Error("No feed_version in feed_info.txt");

  const [currentFeed] = await db
    .select()
    .from(feedInfo)
    .orderBy(desc(feedInfo.fetchedAt))
    .limit(1);

  if (currentFeed?.feedVersion === newVersion) {
    return;
  }

  const oldVersion = currentFeed?.feedVersion ?? null;

  await db.transaction(async (tx) => {
    // Order matters: respect FK dependencies
    //
    // FK chain: stop_times → trips → routes → agencies
    //           stop_times → stops
    //
    // 1. Root tables (no FK parents)
    await syncAgencies(tx, extractAgencies(data.agency), oldVersion, newVersion);
    await syncCalendarTable(tx, extractCalendar(data.calendar), oldVersion, newVersion);

    // 2. Tables depending on agencies
    await syncRoutes(tx, extractRoutes(data.routes), oldVersion, newVersion);

    // 3. Stops (root table, no FK parents)
    await syncStops(tx, extractStops(data.stops), oldVersion, newVersion);

    // 4. Delete stop_times first (FK child of trips + stops)
    const stopTimesData = extractStopTimes(data.stopTimes);
    const stopTimesOldCount = await deleteAll(tx, stopTimes);

    // 5. Sync trips (FK → routes). Safe now that stop_times is empty.
    await syncTrips(tx, extractTrips(data.trips), oldVersion, newVersion);

    // 6. Reinsert stop_times (parents trips + stops now stable)
    await batchInsert(tx, stopTimes, stopTimesData);
    await writeDeleteAndReinsertAudit(tx, "stop_times", stopTimesOldCount, stopTimesData.length, oldVersion, newVersion);

    // 7. Shapes — no FK deps, delete and reinsert
    await deleteAndReinsert(tx, shapes, extractShapes(data.shapes), "shapes", oldVersion, newVersion);

    // 8. Tables without natural PK — delete and reinsert
    await deleteAndReinsert(tx, calendarDates, extractCalendarDates(data.calendarDates), "calendar_dates", oldVersion, newVersion);
    await deleteAndReinsert(tx, transfers, extractTransfers(data.transfers), "transfers", oldVersion, newVersion);

    // 9. Record new feed version
    await tx.insert(feedInfo).values(feedInfoRows[0]);
  });
}

// --- Per-table sync functions for PK-based tables ---

async function syncAgencies(
  tx: Tx,
  newRows: ReturnType<typeof extractAgencies>,
  oldVersion: string | null,
  newVersion: string,
) {
  const existing = await tx.select().from(agencies);
  const existingMap = new Map(existing.map((r) => [r.id, r]));
  const newMap = new Map(newRows.map((r) => [r.id, r]));

  const audit = createAuditTracker();

  for (const [id, row] of newMap) {
    const old = existingMap.get(id);
    if (!old) {
      await tx.insert(agencies).values(row);
      audit.added(id, row);
    } else if (rowChanged(old, row)) {
      await tx.update(agencies).set(row).where(eq(agencies.id, id));
      audit.modified(id, old, row);
    }
  }
  for (const [id, old] of existingMap) {
    if (!newMap.has(id)) {
      await tx.delete(agencies).where(eq(agencies.id, id));
      audit.removed(id, old);
    }
  }

  await writeAudit(tx, audit, "agencies", oldVersion, newVersion);
}

async function syncRoutes(
  tx: Tx,
  newRows: ReturnType<typeof extractRoutes>,
  oldVersion: string | null,
  newVersion: string,
) {
  const existing = await tx.select().from(routes);
  const existingMap = new Map(existing.map((r) => [r.id, r]));
  const newMap = new Map(newRows.map((r) => [r.id, r]));

  const audit = createAuditTracker();

  for (const [id, row] of newMap) {
    const old = existingMap.get(id);
    if (!old) {
      await tx.insert(routes).values(row);
      audit.added(id, row);
    } else if (rowChanged(old, row)) {
      await tx.update(routes).set(row).where(eq(routes.id, id));
      audit.modified(id, old, row);
    }
  }
  for (const [id, old] of existingMap) {
    if (!newMap.has(id)) {
      await tx.delete(routes).where(eq(routes.id, id));
      audit.removed(id, old);
    }
  }

  await writeAudit(tx, audit, "routes", oldVersion, newVersion);
}

async function syncStops(
  tx: Tx,
  newRows: ReturnType<typeof extractStops>,
  oldVersion: string | null,
  newVersion: string,
) {
  const existing = await tx.select().from(stops);
  const existingMap = new Map(existing.map((r) => [r.id, r]));
  const newMap = new Map(newRows.map((r) => [r.id, r]));

  const audit = createAuditTracker();

  for (const [id, row] of newMap) {
    const old = existingMap.get(id);
    if (!old) {
      await tx.insert(stops).values(row);
      audit.added(id, row);
    } else if (rowChanged(old, row)) {
      await tx.update(stops).set(row).where(eq(stops.id, id));
      audit.modified(id, old, row);
    }
  }
  for (const [id, old] of existingMap) {
    if (!newMap.has(id)) {
      await tx.delete(stops).where(eq(stops.id, id));
      audit.removed(id, old);
    }
  }

  await writeAudit(tx, audit, "stops", oldVersion, newVersion);
}

async function syncCalendarTable(
  tx: Tx,
  newRows: ReturnType<typeof extractCalendar>,
  oldVersion: string | null,
  newVersion: string,
) {
  const existing = await tx.select().from(calendar);
  const existingMap = new Map(existing.map((r) => [r.serviceId, r]));
  const newMap = new Map(newRows.map((r) => [r.serviceId, r]));

  const audit = createAuditTracker();

  for (const [id, row] of newMap) {
    const old = existingMap.get(id);
    if (!old) {
      await tx.insert(calendar).values(row);
      audit.added(id, row);
    } else if (rowChanged(old, row)) {
      await tx.update(calendar).set(row).where(eq(calendar.serviceId, id));
      audit.modified(id, old, row);
    }
  }
  for (const [id, old] of existingMap) {
    if (!newMap.has(id)) {
      await tx.delete(calendar).where(eq(calendar.serviceId, id));
      audit.removed(id, old);
    }
  }

  await writeAudit(tx, audit, "calendar", oldVersion, newVersion);
}

async function syncTrips(
  tx: Tx,
  newRows: ReturnType<typeof extractTrips>,
  oldVersion: string | null,
  newVersion: string,
) {
  const existing = await tx.select().from(trips);
  const existingMap = new Map(existing.map((r) => [r.id, r]));
  const newMap = new Map(newRows.map((r) => [r.id, r]));

  const audit = createAuditTracker();

  for (const [id, row] of newMap) {
    const old = existingMap.get(id);
    if (!old) {
      await tx.insert(trips).values(row);
      audit.added(id, row);
    } else if (rowChanged(old, row)) {
      await tx.update(trips).set(row).where(eq(trips.id, id));
      audit.modified(id, old, row);
    }
  }
  for (const [id, old] of existingMap) {
    if (!newMap.has(id)) {
      await tx.delete(trips).where(eq(trips.id, id));
      audit.removed(id, old);
    }
  }

  // Trips is a medium table (~2700 rows), only store counts
  await writeAudit(tx, audit, "trips", oldVersion, newVersion, false);
}

// --- Helpers for split delete/insert flow (used when FK order matters) ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteAll(tx: Tx, table: any): Promise<number> {
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(table);
  await tx.delete(table);
  return Number(count);
}

async function batchInsert<T extends Record<string, unknown>>(
  tx: Tx,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  rows: T[],
) {
  const BATCH_SIZE = 1000;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tx.insert(table).values(batch as any);
  }
}

async function writeDeleteAndReinsertAudit(
  tx: Tx,
  tableName: string,
  oldCount: number,
  newCount: number,
  oldVersion: string | null,
  newVersion: string,
) {
  await tx.insert(gtfsStaticAuditLog).values({
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
  tx: Tx,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  newRows: T[],
  tableName: string,
  oldVersion: string | null,
  newVersion: string,
) {
  const [{ count: oldCount }] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(table);

  await tx.delete(table);

  const BATCH_SIZE = 1000;
  for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
    const batch = newRows.slice(i, i + BATCH_SIZE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tx.insert(table).values(batch as any);
  }

  await tx.insert(gtfsStaticAuditLog).values({
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
  tx: Tx,
  audit: ReturnType<typeof createAuditTracker>,
  tableName: string,
  oldVersion: string | null,
  newVersion: string,
  includeDetails = true,
) {
  if (!audit.hasChanges) return;

  await tx.insert(gtfsStaticAuditLog).values({
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
