import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq } from "drizzle-orm";
import { snapshots } from "../schema";

export async function getLatestFinishedSnapshot(
  db: ReturnType<typeof drizzle>,
  providerId: string,
) {
  const [latest] = await db
    .select()
    .from(snapshots)
    .where(
      and(
        eq(snapshots.providerId, providerId),
        eq(snapshots.finished, 1)
      )
    )
    .orderBy(desc(snapshots.feedTimestamp))
    .limit(1);

  return latest || null;
}

export async function getSnapshotById(
  db: ReturnType<typeof drizzle>,
  snapshotId: number,
) {
  const [snapshot] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.id, snapshotId))
    .limit(1);

  return snapshot || null;
}
