import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const { transit_realtime } = GtfsRealtimeBindings;

export type FeedTripUpdate = GtfsRealtimeBindings.transit_realtime.ITripUpdate;

const BART_GTFS_TRIP_UPDATES = "https://api.bart.gov/gtfsrt/tripupdate.aspx";

export async function fetchTripUpdateFeed(): Promise<
  Map<string, FeedTripUpdate>
> {
  const response = await fetch(BART_GTFS_TRIP_UPDATES);
  const buffer = await response.arrayBuffer();
  const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

  const tripUpdates = new Map<string, FeedTripUpdate>();
  for (const entity of feed.entity ?? []) {
    if (entity.tripUpdate && entity.id) {
      tripUpdates.set(entity.id, entity.tripUpdate);
    }
  }
  return tripUpdates;
}
