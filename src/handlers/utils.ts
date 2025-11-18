import { drizzle } from "drizzle-orm/d1";
import { and, between, desc, eq, sql } from "drizzle-orm";
import { snapshots } from "../schema";

export async function getClosestSnapshot(
  db: ReturnType<typeof drizzle>,
  providerId: string,
  targetTime?: Date,
) {
  const target = targetTime || new Date();
  const oneMinBefore = new Date(target.getTime() - 60 * 1000);
  const oneMinAfter = new Date(target.getTime() + 60 * 1000);

  // Find snapshots within 1 minute window
  const candidates = await db
    .select()
    .from(snapshots)
    .where(
      and(
        eq(snapshots.providerId, providerId),
        between(snapshots.feedTimestamp, oneMinBefore, oneMinAfter),
      ),
    )
    .orderBy(desc(snapshots.feedTimestamp));

  if (candidates.length === 0) {
    return null;
  }

  // Find the closest one
  let closest = candidates[0];
  let minDiff = Math.abs(
    target.getTime() - new Date(closest.feedTimestamp).getTime(),
  );

  for (const candidate of candidates) {
    const diff = Math.abs(
      target.getTime() - new Date(candidate.feedTimestamp).getTime(),
    );
    if (diff < minDiff) {
      minDiff = diff;
      closest = candidate;
    }
  }

  return closest;
}
