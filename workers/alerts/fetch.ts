import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const { transit_realtime } = GtfsRealtimeBindings;

export type FeedAlert = GtfsRealtimeBindings.transit_realtime.IAlert;

const BART_GTFS_ALERTS = "https://api.bart.gov/gtfsrt/alerts.aspx";

export async function fetchAlertFeed(): Promise<Map<string, FeedAlert>> {
  const response = await fetch(BART_GTFS_ALERTS);
  const buffer = await response.arrayBuffer();
  const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

  const feedAlerts = new Map<string, FeedAlert>();
  for (const entity of feed.entity ?? []) {
    if (entity.alert && entity.id) {
      feedAlerts.set(entity.id, entity.alert);
    }
  }

  return feedAlerts;
}

export function decodeFeed(buffer: ArrayBuffer): Map<string, FeedAlert> {
  const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

  const feedAlerts = new Map<string, FeedAlert>();
  for (const entity of feed.entity ?? []) {
    if (entity.alert && entity.id) {
      feedAlerts.set(entity.id, entity.alert);
    }
  }

  return feedAlerts;
}
