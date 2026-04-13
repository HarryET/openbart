import type { createDb } from "../../db/client";
import { tripUpdateSnapshots, stopTimeUpdates } from "../../db/schema";
import type { FeedTripUpdate } from "./fetch";
import { extractTripUpdateContent, extractStopTimeUpdates } from "./extract";

type Db = ReturnType<typeof createDb>;

export async function syncTripUpdates(
  db: Db,
  feedTripUpdates: Map<string, FeedTripUpdate>,
) {
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const [entityId, tripUpdate] of feedTripUpdates) {
      const content = extractTripUpdateContent(entityId, tripUpdate);
      const stopUpdates = extractStopTimeUpdates(tripUpdate);

      const [snapshot] = await tx
        .insert(tripUpdateSnapshots)
        .values({
          tripId: content.tripId,
          vehicleLabel: content.vehicleLabel,
          scheduleRelationship: content.scheduleRelationship,
          feedTimestamp: content.feedTimestamp,
          snapshotTime: now,
        })
        .$returningId();

      if (stopUpdates.length > 0) {
        await tx.insert(stopTimeUpdates).values(
          stopUpdates.map((stu) => ({
            snapshotId: snapshot.id,
            ...stu,
          })),
        );
      }
    }
  });
}
