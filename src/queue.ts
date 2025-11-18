import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { drizzle } from "drizzle-orm/d1";
import { PROVIDER_CONFIG } from "./providers";
import {
  snapshots,
  entities,
  tripUpdates,
  vehiclePositions,
  alerts,
  tripDescriptors,
  vehicleDescriptors,
  positions,
  stopTimeUpdates,
  stopTimeEvents,
  timeRanges,
  entitySelectors,
} from "./schema";

export const queueHandler: ExportedHandlerQueueHandler<
  CloudflareBindings,
  string
> = async (batch, env, ctx) => {
  const db = drizzle(env.DATABASE);

  await Promise.all(
    batch.messages
      .map((message) => ({
        message,
        provider_id: message.body,
        ...PROVIDER_CONFIG[message.body],
      }))
      .map(
        async ({
          message,
          provider_id,
          tripupdates_url,
          alerts_url,
          headers,
        }: {
          message: Message<string>;
          provider_id: string;
          tripupdates_url: string;
          alerts_url: string;
          headers: Record<string, string>;
        }) => {
          try {
            // Process both trip updates and alerts feeds
            const urls = [
              { url: tripupdates_url, type: "trip_updates" },
              { url: alerts_url, type: "alerts" },
            ];

            for (const { url, type } of urls) {
              // Fetch GTFS RealTime feed
              const response = await fetch(url, { headers });
              if (!response.ok) {
                throw new Error(
                  `Failed to fetch ${type} feed for ${String(provider_id)}: ${response.status}`,
                );
              }

              const buffer = await response.arrayBuffer();
              const feed =
                GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
                  new Uint8Array(buffer),
                );

              // Insert snapshot
              const [snapshot] = await db
                .insert(snapshots)
                .values({
                  providerId: String(provider_id),
                  feedTimestamp: new Date(
                    Number(feed.header.timestamp) * 1000,
                  ),
                  gtfsRealtimeVersion: feed.header.gtfsRealtimeVersion || "2.0",
                  incrementality: feed.header.incrementality || 0,
                  feedVersion: undefined,
                  rawFeed: new Uint8Array(buffer).toString(),
                  entitiesCount: feed.entity.length,
                })
                .returning();

              // Process entities
              for (const entity of feed.entity) {
                let entityType = "UNKNOWN";
                let tripUpdateId: number | null = null;
                let vehiclePositionId: number | null = null;
                let alertId: number | null = null;

                // Process TripUpdate
                if (entity.tripUpdate) {
                  const tu = entity.tripUpdate;
                  entityType = "TRIP_UPDATE";

                  // Insert TripDescriptor if exists
                  if (tu.trip) {
                    await db
                      .insert(tripDescriptors)
                      .values({
                        providerId: String(provider_id),
                        tripId: tu.trip.tripId || "",
                        routeId: tu.trip.routeId || undefined,
                        directionId: tu.trip.directionId ?? undefined,
                        scheduleRelationship: tu.trip.scheduleRelationship ?? 0,
                        startDate: tu.trip.startDate || undefined,
                        startTime: tu.trip.startTime || undefined,
                      })
                      .onConflictDoNothing();
                  }

                  // Insert VehicleDescriptor if exists
                  if (tu.vehicle) {
                    await db
                      .insert(vehicleDescriptors)
                      .values({
                        providerId: String(provider_id),
                        vehicleId: tu.vehicle.id || "",
                        label: tu.vehicle.label || undefined,
                        licensePlate: tu.vehicle.licensePlate || undefined,
                      })
                      .onConflictDoNothing();
                  }

                  // Insert TripUpdate
                  const [tripUpdateRecord] = await db
                    .insert(tripUpdates)
                    .values({
                      providerId: String(provider_id),
                      entityId: entity.id,
                      timestamp: tu.timestamp
                        ? new Date(Number(tu.timestamp) * 1000)
                        : undefined,
                      delay: tu.delay ?? undefined,
                      tripProperties: undefined,
                    })
                    .returning();

                  tripUpdateId = tripUpdateRecord.id;

                  // Insert StopTimeUpdates
                  if (tu.stopTimeUpdate) {
                    for (const stu of tu.stopTimeUpdate) {
                      const [stopTimeUpdate] = await db
                        .insert(stopTimeUpdates)
                        .values({
                          tripUpdateId: tripUpdateRecord.id,
                          providerId: String(provider_id),
                          stopSequence: stu.stopSequence ?? undefined,
                          scheduleRelationship: stu.scheduleRelationship ?? 0,
                          departureOccupancyStatus: undefined,
                          stopTimeProperties: undefined,
                        })
                        .returning();

                      // Insert arrival StopTimeEvent
                      if (stu.arrival) {
                        await db
                          .insert(stopTimeEvents)
                          .values({
                            stopTimeUpdateId: stopTimeUpdate.id,
                            type: 0, // arrival
                            delay: stu.arrival.delay ?? undefined,
                            time: stu.arrival.time
                              ? new Date(Number(stu.arrival.time) * 1000)
                              : undefined,
                            uncertainty: stu.arrival.uncertainty ?? undefined,
                            scheduledTime: undefined,
                          })
                          .onConflictDoNothing();
                      }

                      // Insert departure StopTimeEvent
                      if (stu.departure) {
                        await db
                          .insert(stopTimeEvents)
                          .values({
                            stopTimeUpdateId: stopTimeUpdate.id,
                            type: 1, // departure
                            delay: stu.departure.delay ?? undefined,
                            time: stu.departure.time
                              ? new Date(Number(stu.departure.time) * 1000)
                              : undefined,
                            uncertainty: stu.departure.uncertainty ?? undefined,
                            scheduledTime: undefined,
                          })
                          .onConflictDoNothing();
                      }
                    }
                  }
                }

                // Process VehiclePosition
                if (entity.vehicle) {
                  const vp = entity.vehicle;
                  entityType = "VEHICLE_POSITION";

                  // Insert TripDescriptor if exists
                  if (vp.trip) {
                    await db
                      .insert(tripDescriptors)
                      .values({
                        providerId: String(provider_id),
                        tripId: vp.trip.tripId || "",
                        routeId: vp.trip.routeId || undefined,
                        directionId: vp.trip.directionId ?? undefined,
                        scheduleRelationship: vp.trip.scheduleRelationship ?? 0,
                        startDate: vp.trip.startDate || undefined,
                        startTime: vp.trip.startTime || undefined,
                      })
                      .onConflictDoNothing();
                  }

                  // Insert VehicleDescriptor if exists
                  if (vp.vehicle) {
                    await db
                      .insert(vehicleDescriptors)
                      .values({
                        providerId: String(provider_id),
                        vehicleId: vp.vehicle.id || "",
                        label: vp.vehicle.label || undefined,
                        licensePlate: vp.vehicle.licensePlate || undefined,
                      })
                      .onConflictDoNothing();
                  }

                  // Insert Position if exists
                  if (vp.position) {
                    await db
                      .insert(positions)
                      .values({
                        providerId: String(provider_id),
                        entityId: entity.id,
                        latitude: vp.position.latitude?.toString(),
                        longitude: vp.position.longitude?.toString(),
                        bearing: vp.position.bearing ?? undefined,
                        odometer: vp.position.odometer?.toString(),
                        speed: vp.position.speed?.toString(),
                      })
                      .onConflictDoNothing();
                  }

                  // Insert VehiclePosition
                  const [vehiclePositionRecord] = await db
                    .insert(vehiclePositions)
                    .values({
                      providerId: String(provider_id),
                      entityId: entity.id,
                      currentStopSequence: vp.currentStopSequence ?? undefined,
                      stopId: vp.stopId || undefined,
                      currentStatus: vp.currentStatus ?? 2,
                      timestamp: vp.timestamp
                        ? new Date(Number(vp.timestamp) * 1000)
                        : undefined,
                      congestionLevel: vp.congestionLevel ?? 0,
                      occupancyStatus: vp.occupancyStatus ?? 7,
                      occupancyPercentage: vp.occupancyPercentage ?? undefined,
                      multiCarriageDetails: undefined,
                    })
                    .returning();

                  vehiclePositionId = vehiclePositionRecord.id;
                }

                // Process Alert
                if (entity.alert) {
                  const alert = entity.alert;
                  entityType = "ALERT";

                  // Insert Alert
                  const [alertRecord] = await db
                    .insert(alerts)
                    .values({
                      providerId: String(provider_id),
                      entityId: entity.id,
                      cause: alert.cause ?? 1,
                      effect: alert.effect ?? 8,
                      severityLevel: alert.severityLevel ?? 1,
                      url: alert.url ? JSON.stringify(alert.url) : undefined,
                      headerText: alert.headerText
                        ? JSON.stringify(alert.headerText)
                        : undefined,
                      descriptionText: alert.descriptionText
                        ? JSON.stringify(alert.descriptionText)
                        : undefined,
                      ttsHeaderText: alert.ttsHeaderText
                        ? JSON.stringify(alert.ttsHeaderText)
                        : undefined,
                      ttsDescriptionText: alert.ttsDescriptionText
                        ? JSON.stringify(alert.ttsDescriptionText)
                        : undefined,
                      image: undefined,
                      imageAlternativeText: undefined,
                      causeDetail: undefined,
                      effectDetail: undefined,
                    })
                    .returning();

                  alertId = alertRecord.id;

                  // Insert active periods
                  if (alert.activePeriod) {
                    for (const period of alert.activePeriod) {
                      await db.insert(timeRanges).values({
                        alertId: alertRecord.id,
                        providerId: String(provider_id),
                        entityId: entity.id,
                        start: period.start
                          ? new Date(Number(period.start) * 1000)
                          : undefined,
                        end: period.end
                          ? new Date(Number(period.end) * 1000)
                          : undefined,
                      });
                    }
                  }

                  // Insert informed entities
                  if (alert.informedEntity) {
                    for (const informed of alert.informedEntity) {
                      await db.insert(entitySelectors).values({
                        alertId: alertRecord.id,
                        providerId: String(provider_id),
                        agencyId: informed.agencyId || undefined,
                        routeId: informed.routeId || undefined,
                        routeType: informed.routeType ?? undefined,
                        tripId: informed.trip?.tripId || undefined,
                        directionId: informed.directionId ?? undefined,
                        stopId: informed.stopId || undefined,
                      });
                    }
                  }
                }

                // Insert Entity record
                await db.insert(entities).values({
                  snapshotId: snapshot.id,
                  entityId: entity.id,
                  isDeleted: entity.isDeleted ? 1 : 0,
                  type: entityType,
                  tripUpdateId,
                  vehiclePositionId,
                  alertId,
                });
              }
            }


            message.ack();
          } catch (error) {
            console.error(`Error processing ${provider_id}:`, error);
            message.retry();
          }
        },
      ),
  );
};
