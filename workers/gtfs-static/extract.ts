type Row = Record<string, string>;

function toIntOrNull(val: string | undefined): number | null {
  if (!val || val === "") return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function toTextOrNull(val: string | undefined): string | null {
  if (!val || val === "") return null;
  return val;
}

export function extractAgencies(rows: Row[]) {
  return rows.map((r) => ({
    id: r.agency_id,
    name: r.agency_name,
    url: toTextOrNull(r.agency_url),
    timezone: toTextOrNull(r.agency_timezone),
    phone: toTextOrNull(r.agency_phone),
  }));
}

export function extractRoutes(rows: Row[]) {
  return rows.map((r) => ({
    id: r.route_id,
    agencyId: toTextOrNull(r.agency_id),
    shortName: toTextOrNull(r.route_short_name),
    longName: toTextOrNull(r.route_long_name),
    type: toIntOrNull(r.route_type),
    color: toTextOrNull(r.route_color),
    textColor: toTextOrNull(r.route_text_color),
  }));
}

export function extractStops(rows: Row[]) {
  return rows.map((r) => ({
    id: r.stop_id,
    name: r.stop_name,
    lat: toTextOrNull(r.stop_lat),
    lon: toTextOrNull(r.stop_lon),
    parentStation: toTextOrNull(r.parent_station),
    platformCode: toTextOrNull(r.platform_code),
    locationType: toIntOrNull(r.location_type),
  }));
}

export function extractTrips(rows: Row[]) {
  return rows.map((r) => ({
    id: r.trip_id,
    routeId: r.route_id,
    serviceId: r.service_id,
    tripHeadsign: toTextOrNull(r.trip_headsign),
    directionId: toIntOrNull(r.direction_id),
    blockId: toTextOrNull(r.block_id),
    shapeId: toTextOrNull(r.shape_id),
  }));
}

export function extractStopTimes(rows: Row[]) {
  return rows.map((r) => ({
    tripId: r.trip_id,
    stopId: r.stop_id,
    arrivalTime: toTextOrNull(r.arrival_time),
    departureTime: toTextOrNull(r.departure_time),
    stopSequence: parseInt(r.stop_sequence, 10),
    pickupType: toIntOrNull(r.pickup_type),
    dropOffType: toIntOrNull(r.drop_off_type),
  }));
}

export function extractCalendar(rows: Row[]) {
  return rows.map((r) => ({
    serviceId: r.service_id,
    monday: parseInt(r.monday, 10),
    tuesday: parseInt(r.tuesday, 10),
    wednesday: parseInt(r.wednesday, 10),
    thursday: parseInt(r.thursday, 10),
    friday: parseInt(r.friday, 10),
    saturday: parseInt(r.saturday, 10),
    sunday: parseInt(r.sunday, 10),
    startDate: r.start_date,
    endDate: r.end_date,
  }));
}

export function extractCalendarDates(rows: Row[]) {
  return rows.map((r) => ({
    serviceId: r.service_id,
    date: r.date,
    exceptionType: parseInt(r.exception_type, 10),
  }));
}

export function extractShapes(rows: Row[]) {
  return rows.map((r) => ({
    shapeId: r.shape_id,
    shapePtLat: r.shape_pt_lat,
    shapePtLon: r.shape_pt_lon,
    shapePtSequence: parseInt(r.shape_pt_sequence, 10),
    shapeDistTraveled: toTextOrNull(r.shape_dist_traveled),
  }));
}

export function extractTransfers(rows: Row[]) {
  return rows.map((r) => ({
    fromStopId: r.from_stop_id,
    toStopId: r.to_stop_id,
    transferType: toIntOrNull(r.transfer_type),
    minTransferTime: toIntOrNull(r.min_transfer_time),
  }));
}

export function extractFeedInfo(rows: Row[]) {
  return rows.map((r) => ({
    feedPublisherName: toTextOrNull(r.feed_publisher_name),
    feedPublisherUrl: toTextOrNull(r.feed_publisher_url),
    feedLang: toTextOrNull(r.feed_lang),
    feedVersion: r.feed_version,
    feedStartDate: toTextOrNull(r.feed_start_date),
    feedEndDate: toTextOrNull(r.feed_end_date),
  }));
}
