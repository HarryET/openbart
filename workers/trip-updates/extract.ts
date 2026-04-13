import type { FeedTripUpdate } from "./fetch";

export type TripUpdateContent = {
  tripId: string;
  vehicleLabel: string | null;
  scheduleRelationship: number | null;
  feedTimestamp: number | null;
};

export type StopTimeUpdateContent = {
  stopId: string;
  stopSequence: number | null;
  arrivalDelay: number | null;
  arrivalTime: number | null;
  arrivalUncertainty: number | null;
  departureDelay: number | null;
  departureTime: number | null;
  departureUncertainty: number | null;
  scheduleRelationship: number | null;
};

export function extractTripUpdateContent(
  entityId: string,
  tripUpdate: FeedTripUpdate,
): TripUpdateContent {
  return {
    tripId: tripUpdate.trip?.tripId ?? entityId,
    vehicleLabel: tripUpdate.vehicle?.label ?? null,
    scheduleRelationship: tripUpdate.trip?.scheduleRelationship ?? null,
    feedTimestamp: tripUpdate.timestamp ? Number(tripUpdate.timestamp) : null,
  };
}

export function extractStopTimeUpdates(
  tripUpdate: FeedTripUpdate,
): StopTimeUpdateContent[] {
  return (tripUpdate.stopTimeUpdate ?? []).map((stu, i) => ({
    stopId: stu.stopId ?? "",
    stopSequence: stu.stopSequence ?? i,
    arrivalDelay: stu.arrival?.delay ?? null,
    arrivalTime: stu.arrival?.time ? Number(stu.arrival.time) : null,
    arrivalUncertainty: stu.arrival?.uncertainty ?? null,
    departureDelay: stu.departure?.delay ?? null,
    departureTime: stu.departure?.time ? Number(stu.departure.time) : null,
    departureUncertainty: stu.departure?.uncertainty ?? null,
    scheduleRelationship: stu.scheduleRelationship ?? null,
  }));
}
