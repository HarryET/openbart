import { unzipSync } from "fflate";
import Papa from "papaparse";

const BART_GTFS_STATIC_URL =
  "https://www.bart.gov/dev/schedules/google_transit.zip";

export type GtfsStaticData = {
  agency: Record<string, string>[];
  routes: Record<string, string>[];
  stops: Record<string, string>[];
  trips: Record<string, string>[];
  stopTimes: Record<string, string>[];
  calendar: Record<string, string>[];
  calendarDates: Record<string, string>[];
  shapes: Record<string, string>[];
  transfers: Record<string, string>[];
  feedInfo: Record<string, string>[];
};

const FILE_MAP: Record<keyof GtfsStaticData, string> = {
  agency: "agency.txt",
  routes: "routes.txt",
  stops: "stops.txt",
  trips: "trips.txt",
  stopTimes: "stop_times.txt",
  calendar: "calendar.txt",
  calendarDates: "calendar_dates.txt",
  shapes: "shapes.txt",
  transfers: "transfers.txt",
  feedInfo: "feed_info.txt",
};

export async function fetchGtfsStaticData(): Promise<GtfsStaticData> {
  const response = await fetch(BART_GTFS_STATIC_URL);
  const buffer = await response.arrayBuffer();
  return parseGtfsZip(new Uint8Array(buffer));
}

export function parseGtfsZip(zipBytes: Uint8Array): GtfsStaticData {
  const files = unzipSync(zipBytes);

  const result = {} as GtfsStaticData;
  for (const [key, filename] of Object.entries(FILE_MAP)) {
    const fileBytes = files[filename];
    if (!fileBytes) {
      result[key as keyof GtfsStaticData] = [];
      continue;
    }
    const csvText = new TextDecoder().decode(fileBytes);
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    result[key as keyof GtfsStaticData] = parsed.data as Record<
      string,
      string
    >[];
  }
  return result;
}
