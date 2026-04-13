# OpenBART Database Guide

## Data Sources

OpenBART pulls from three BART data feeds:

| Feed | URL | Frequency | Format |
|---|---|---|---|
| GTFS-RT Alerts | `https://api.bart.gov/gtfsrt/alerts.aspx` | Every minute | Protobuf |
| GTFS-RT Trip Updates | `https://api.bart.gov/gtfsrt/tripupdate.aspx` | Every minute | Protobuf |
| GTFS Static | `https://www.bart.gov/dev/schedules/google_transit.zip` | Daily (07:15 UTC) | ZIP of CSVs |

Both realtime feeds are decoded using `gtfs-realtime-bindings`. The static feed is unzipped with `fflate` and parsed with `papaparse`.

---

## Tables

### GTFS Static Reference Tables

These tables mirror the official GTFS spec. They're populated by the daily cron and represent BART's published schedule. Changes are detected by comparing the `feed_version` field — if unchanged, the sync is skipped entirely.

#### `agencies`

One row. It's BART.

| Column | Type | Example |
|---|---|---|
| `id` | text PK | `"BART"` |
| `name` | text | `"Bay Area Rapid Transit"` |
| `url` | text | `"https://www.bart.gov/"` |
| `timezone` | text | `"America/Los_Angeles"` |
| `phone` | text | `"510-464-6000"` |

**Source:** `agency.txt` from GTFS static ZIP  
**Sync:** Diff-based upsert. Audit log includes full row details on change.

#### `routes`

BART's rail lines. Each direction is a separate route (e.g., Yellow-S and Yellow-N).

| Column | Type | Example |
|---|---|---|
| `id` | text PK | `"1"` |
| `agency_id` | text FK → agencies | `"BART"` |
| `short_name` | text | `"Yellow-S"` |
| `long_name` | text | `"Antioch to SF Int'l Airport SFO/Millbrae"` |
| `type` | integer | `1` (rail) |
| `color` | text | `"FFFF33"` |
| `text_color` | text | `"000000"` |

Current routes:

| ID | Line | Direction | Color |
|---|---|---|---|
| 1, 2 | Yellow | S, N | `FFFF33` |
| 3, 4 | Orange | N, S | `FF9933` |
| 5, 6 | Green | S, N | `339933` |
| 7, 8 | Red | S, N | `FF0000` |
| 11, 12 | Blue | S, N | `0099CC` |
| 19, 20 | Grey (OAK Airport) | N, S | `B0BEC7` |
| BB-A, BB-B | Bus Bridge | N, S | `000000` |

**Source:** `routes.txt`  
**Sync:** Diff-based upsert with audit logging.

#### `stops`

All BART stops at three levels of the location hierarchy:

| `location_type` | Meaning | Count | Example |
|---|---|---|---|
| `1` | Station | ~50 | `"EMBR"` — Embarcadero |
| `0` | Platform | ~100 | `"M10-1"` — Embarcadero Platform 1 |
| `2` | Entrance/Exit | ~130 | `"EMBR_1"` — Market & Spear (SE) |

| Column | Type | Example |
|---|---|---|
| `id` | text PK | `"M10-1"` |
| `name` | text | `"Embarcadero"` |
| `lat` | numeric | `37.792762` |
| `lon` | numeric | `-122.397037` |
| `parent_station` | text | `"EMBR"` (links platform → station) |
| `platform_code` | text | `"1"` |
| `location_type` | integer | `0` |

**Source:** `stops.txt`  
**Sync:** Diff-based upsert. `parent_station` is a self-referencing text field (not a formal FK).

#### `trips`

Every scheduled trip for the current timetable period (~2,700 rows).

| Column | Type | Example |
|---|---|---|
| `id` | text PK | `"1850208"` |
| `route_id` | text FK → routes | `"5"` (Green-S) |
| `service_id` | text | `"2026_01_12-DX-MVS-Weekday-001"` |
| `trip_headsign` | text | `"OAK Airport / SF / Daly City"` |
| `direction_id` | integer | `1` (South) |
| `block_id` | text | |
| `shape_id` | text | `"005A_shp"` |

**Source:** `trips.txt`  
**Sync:** Diff-based upsert. This is the key join table — realtime trip updates reference these trip IDs.

#### `stop_times`

Scheduled arrival/departure at each stop for every trip (~38,000 rows).

| Column | Type | Example |
|---|---|---|
| `id` | serial PK | |
| `trip_id` | text FK → trips | `"1850208"` |
| `stop_id` | text FK → stops | `"M10-1"` |
| `arrival_time` | text | `"06:43:00"` |
| `departure_time` | text | `"06:43:00"` |
| `stop_sequence` | integer | `7` |
| `pickup_type` | integer | |
| `drop_off_type` | integer | |

Times are stored as text because GTFS allows times >24:00:00 (e.g., `"25:30:00"` for a trip that started before midnight).

**Source:** `stop_times.txt`  
**Sync:** Delete-and-reinsert (no natural PK). Batch inserted in chunks of 1,000.  
**Indexes:** `(trip_id, stop_sequence)`, `(stop_id)`

#### `calendar`

Which days each service pattern runs.

| Column | Type | Example |
|---|---|---|
| `service_id` | text PK | `"2026_01_12-DX-MVS-Weekday-001"` |
| `monday`–`sunday` | integer | `1` or `0` |
| `start_date` | text | `"20260112"` |
| `end_date` | text | `"20260807"` |

**Source:** `calendar.txt`  
**Sync:** Diff-based upsert.

#### `calendar_dates`

Holiday exceptions to the regular calendar.

| Column | Type | Example |
|---|---|---|
| `id` | serial PK | |
| `service_id` | text | `"2026_01_12-DX-MVS-Weekday-001"` |
| `date` | text | `"20260525"` (Memorial Day) |
| `exception_type` | integer | `2` (service removed) |

**Source:** `calendar_dates.txt`  
**Sync:** Delete-and-reinsert.

#### `shapes`

Geographic coordinates tracing each route's path (~28,000 points).

| Column | Type | Example |
|---|---|---|
| `id` | serial PK | |
| `shape_id` | text | `"001A_shp"` |
| `shape_pt_lat` | numeric | `37.99538897` |
| `shape_pt_lon` | numeric | `-121.780434327` |
| `shape_pt_sequence` | integer | `1` |
| `shape_dist_traveled` | numeric | `0` |

**Source:** `shapes.txt`  
**Sync:** Delete-and-reinsert in chunks of 1,000.  
**Index:** `(shape_id, shape_pt_sequence)`

#### `transfers`

Where riders can transfer between lines (~30 rows).

| Column | Type | Example |
|---|---|---|
| `id` | serial PK | |
| `from_stop_id` | text | `"K30-2"` (MacArthur platform 2) |
| `to_stop_id` | text | `"K30-4"` (MacArthur platform 4) |
| `transfer_type` | integer | `2` (timed transfer) |
| `min_transfer_time` | integer | `30` (seconds) |

**Source:** `transfers.txt`  
**Sync:** Delete-and-reinsert.

#### `feed_info`

Tracks which version of the GTFS static data is loaded. Used for change detection.

| Column | Type | Example |
|---|---|---|
| `id` | serial PK | |
| `feed_version` | text | `"72"` |
| `feed_publisher_name` | text | `"Bay Area Rapid Transit"` |
| `feed_start_date` | text | `"20260112"` |
| `feed_end_date` | text | `"20260807"` |
| `fetched_at` | timestamptz | `2026-04-12 07:15:00+00` |

**Sync:** A new row is inserted each time a new feed version is detected. The daily cron compares the latest row's `feed_version` against the downloaded ZIP — if they match, no work is done.

#### `gtfs_static_audit_log`

Records what changed each time the static data is updated.

| Column | Type | Example |
|---|---|---|
| `id` | serial PK | |
| `feed_version_old` | text | `"71"` |
| `feed_version_new` | text | `"72"` |
| `table_name` | text | `"routes"` |
| `rows_added` | integer | `2` |
| `rows_removed` | integer | `0` |
| `rows_modified` | integer | `1` |
| `details` | jsonb | `[{"action":"added","key":"BB-A","new":{...}}, ...]` |
| `created_at` | timestamptz | |

For small tables (agencies, routes, stops, calendar), `details` contains full row-level diffs. For large tables (stop_times, shapes), `details` is null and only counts are recorded.

---

### Realtime Tables

#### `alerts`

Current and historical BART service alerts, soft-deleted when they disappear from the feed.

| Column | Type | Example |
|---|---|---|
| `id` | serial PK | |
| `feed_entity_id` | text, unique | `"BSA_291059"` |
| `header_text` | text | `"BART.gov Alert"` |
| `description_text` | text | `"10-minute delay on the Berryessa Line..."` |
| `url` | text | `"http://www.bart.gov/schedules/advisories"` |
| `cause` | integer | `1` (UNKNOWN_CAUSE) |
| `effect` | integer | `8` (UNKNOWN_EFFECT) |
| `severity_level` | integer | `1` (UNKNOWN_SEVERITY) |
| `active_periods` | jsonb | `[]` (BART doesn't set these) |
| `created_at` | timestamptz | first time we saw it |
| `updated_at` | timestamptz | last time it appeared in the feed |
| `deleted_at` | timestamptz, nullable | when it disappeared from the feed |

**Lifecycle:**
- **New alert** appears in feed → inserted with `created_at = now`, `deleted_at = null`
- **Every minute** it's still in the feed → `updated_at` is bumped
- **Content changes** (text, cause, effect, etc.) → row is updated, new version recorded
- **Disappears from feed** → `deleted_at` is set (soft delete)
- **Reappears** → `deleted_at` cleared, content updated, new version if content differs

#### `alert_informed_entities`

Which routes/stops/agencies an alert affects. One row per affected entity per alert.

| Column | Type | Example |
|---|---|---|
| `id` | serial PK | |
| `alert_id` | integer FK → alerts | |
| `agency_id` | text | `"BART"` |
| `route_id` | text | |
| `stop_id` | text | |
| `direction_id` | integer | |
| `route_type` | integer | |
| `trip_id` | text | |

Currently BART only populates `agency_id = "BART"` on all alerts (not granular by route/stop).

#### `alert_versions`

Immutable snapshots recorded each time an alert's content changes. Enables time-travel through an alert's history.

| Column | Type |
|---|---|
| `id` | serial PK |
| `alert_id` | integer FK → alerts |
| `header_text` | text |
| `description_text` | text |
| `url` | text |
| `cause`, `effect`, `severity_level` | integer |
| `active_periods` | jsonb |
| `informed_entities` | jsonb (snapshot of entities at this point) |
| `created_at` | timestamptz |

A version is recorded when: an alert first appears, its content changes, or it reappears after deletion with different content.

#### `trip_update_snapshots`

One row per active train per minute. This is append-only time-series data.

| Column | Type | Example |
|---|---|---|
| `id` | serial PK | |
| `trip_id` | text | `"1850208"` |
| `vehicle_label` | text | `"3-door"` |
| `schedule_relationship` | integer | `0` (SCHEDULED) |
| `feed_timestamp` | integer | |
| `snapshot_time` | timestamptz | `2026-04-12 16:57:00+00` |

~70 rows inserted per minute (one per active train).

**Indexes:** `(trip_id, snapshot_time)`, `(snapshot_time)`

#### `stop_time_updates`

Per-stop delay and timing data for each train snapshot. The core data for delay analysis.

| Column | Type | Example |
|---|---|---|
| `id` | serial PK | |
| `snapshot_id` | integer FK → trip_update_snapshots | |
| `stop_id` | text | `"A70-2"` (South Hayward, platform 2) |
| `stop_sequence` | integer | `0` |
| `arrival_delay` | integer | `109` (seconds late) |
| `arrival_time` | integer | `1776038452` (unix timestamp) |
| `arrival_uncertainty` | integer | `30` |
| `departure_delay` | integer | `109` |
| `departure_time` | integer | `1776038470` |
| `departure_uncertainty` | integer | `30` |
| `schedule_relationship` | integer | |

~1,400 rows inserted per minute (70 trains x ~20 stops each). That's ~2M rows/day.

**Indexes:** `(snapshot_id)`, `(stop_id, snapshot_id)`

---

## Key Joins

The central relationship chain for delay analysis:

```
stop_time_updates
  → trip_update_snapshots (via snapshot_id)
    → trips (via trip_id)
      → routes (via route_id)    -- gives you the line/color
  → stops (via stop_id)
    → stops (via parent_station) -- gives you the station name
```

---

## Example Queries

### Current status of all lines

What a status page hero banner would query. Shows each line's current health based on the last 5 minutes of data.

```sql
SELECT
  r.short_name,
  r.color,
  count(*) AS total_stops,
  round(avg(stu.arrival_delay)) AS avg_delay_sec,
  round(
    100.0 * count(*) FILTER (WHERE stu.arrival_delay <= 60) / count(*),
    1
  ) AS on_time_pct,
  max(stu.arrival_delay) AS worst_delay_sec,
  CASE
    WHEN avg(stu.arrival_delay) <= 60 THEN 'operational'
    WHEN avg(stu.arrival_delay) <= 300 THEN 'degraded'
    ELSE 'outage'
  END AS status
FROM stop_time_updates stu
JOIN trip_update_snapshots snap ON snap.id = stu.snapshot_id
JOIN trips t ON t.id = snap.trip_id
JOIN routes r ON r.id = t.route_id
WHERE snap.snapshot_time > now() - interval '5 minutes'
  AND stu.arrival_delay IS NOT NULL
GROUP BY r.short_name, r.color
ORDER BY avg_delay_sec DESC;
```

### Hourly status timeline (for uptime-style bars)

```sql
SELECT
  r.short_name,
  r.color,
  date_trunc('hour', snap.snapshot_time) AS hour,
  round(avg(stu.arrival_delay)) AS avg_delay_sec,
  round(
    100.0 * count(*) FILTER (WHERE stu.arrival_delay <= 60) / count(*),
    1
  ) AS on_time_pct,
  CASE
    WHEN avg(stu.arrival_delay) <= 60 THEN 'operational'
    WHEN avg(stu.arrival_delay) <= 300 THEN 'degraded'
    ELSE 'outage'
  END AS status
FROM stop_time_updates stu
JOIN trip_update_snapshots snap ON snap.id = stu.snapshot_id
JOIN trips t ON t.id = snap.trip_id
JOIN routes r ON r.id = t.route_id
WHERE snap.snapshot_time > now() - interval '24 hours'
  AND stu.arrival_delay IS NOT NULL
GROUP BY r.short_name, r.color, date_trunc('hour', snap.snapshot_time)
ORDER BY r.short_name, hour;
```

### Current location of all trains

Shows every active train with its next stop and delay.

```sql
SELECT
  snap.trip_id,
  t.trip_headsign AS destination,
  r.short_name AS line,
  r.color,
  snap.vehicle_label,
  stu.stop_id,
  s.name AS stop_name,
  stu.stop_sequence,
  stu.arrival_delay AS delay_sec,
  to_timestamp(stu.arrival_time) AS expected_arrival
FROM trip_update_snapshots snap
JOIN stop_time_updates stu ON stu.snapshot_id = snap.id
JOIN trips t ON t.id = snap.trip_id
JOIN routes r ON r.id = t.route_id
JOIN stops s ON s.id = stu.stop_id
WHERE snap.snapshot_time = (
  SELECT max(snapshot_time) FROM trip_update_snapshots
)
AND stu.stop_sequence = (
  -- Get the first upcoming stop for each trip
  SELECT min(stu2.stop_sequence)
  FROM stop_time_updates stu2
  WHERE stu2.snapshot_id = snap.id
    AND stu2.arrival_time > extract(epoch FROM now())
)
ORDER BY r.short_name, stu.arrival_time;
```

### All current alerts

```sql
SELECT
  feed_entity_id,
  header_text,
  description_text,
  url,
  created_at,
  updated_at,
  -- How long has this alert been active?
  now() - created_at AS duration
FROM alerts
WHERE deleted_at IS NULL
ORDER BY created_at DESC;
```

### Alert history (time-travel through versions)

```sql
SELECT
  av.created_at AS version_time,
  av.header_text,
  av.description_text,
  av.cause,
  av.effect,
  av.informed_entities
FROM alert_versions av
JOIN alerts a ON a.id = av.alert_id
WHERE a.feed_entity_id = 'BSA_291059'
ORDER BY av.created_at;
```

### Next departures from a station

Shows the next 10 scheduled departures from Embarcadero, with realtime delay applied.

```sql
WITH scheduled AS (
  SELECT
    st.trip_id,
    t.trip_headsign AS destination,
    r.short_name AS line,
    r.color,
    st.departure_time AS scheduled_time,
    st.stop_sequence
  FROM stop_times st
  JOIN trips t ON t.id = st.trip_id
  JOIN routes r ON r.id = t.route_id
  JOIN calendar c ON c.service_id = t.service_id
  WHERE st.stop_id IN (
    -- All platforms at Embarcadero
    SELECT id FROM stops WHERE parent_station = 'EMBR'
  )
  -- Filter for today's service
  AND c.start_date <= to_char(now() AT TIME ZONE 'America/Los_Angeles', 'YYYYMMDD')
  AND c.end_date >= to_char(now() AT TIME ZONE 'America/Los_Angeles', 'YYYYMMDD')
  AND CASE extract(dow FROM now() AT TIME ZONE 'America/Los_Angeles')
    WHEN 0 THEN c.sunday
    WHEN 1 THEN c.monday
    WHEN 2 THEN c.tuesday
    WHEN 3 THEN c.wednesday
    WHEN 4 THEN c.thursday
    WHEN 5 THEN c.friday
    WHEN 6 THEN c.saturday
  END = 1
  -- Only future departures (approximate: compare HH:MM:SS strings)
  AND st.departure_time > to_char(now() AT TIME ZONE 'America/Los_Angeles', 'HH24:MI:SS')
  ORDER BY st.departure_time
  LIMIT 10
)
SELECT
  s.line,
  s.color,
  s.destination,
  s.scheduled_time,
  stu.departure_delay AS delay_sec,
  s.scheduled_time || CASE
    WHEN stu.departure_delay IS NOT NULL AND stu.departure_delay > 60
    THEN ' (+' || (stu.departure_delay / 60) || ' min)'
    ELSE ''
  END AS display_time
FROM scheduled s
LEFT JOIN trip_update_snapshots snap
  ON snap.trip_id = s.trip_id
  AND snap.snapshot_time = (SELECT max(snapshot_time) FROM trip_update_snapshots)
LEFT JOIN stop_time_updates stu
  ON stu.snapshot_id = snap.id
  AND stu.stop_sequence = s.stop_sequence
ORDER BY s.scheduled_time;
```

### How often is the Yellow line late? (past 7 days)

```sql
SELECT
  count(*) AS total_observations,
  count(*) FILTER (WHERE stu.arrival_delay <= 60) AS on_time,
  count(*) FILTER (WHERE stu.arrival_delay BETWEEN 61 AND 300) AS minor_delay,
  count(*) FILTER (WHERE stu.arrival_delay BETWEEN 301 AND 600) AS moderate_delay,
  count(*) FILTER (WHERE stu.arrival_delay > 600) AS major_delay,
  round(
    100.0 * count(*) FILTER (WHERE stu.arrival_delay <= 60) / count(*),
    1
  ) AS on_time_pct
FROM stop_time_updates stu
JOIN trip_update_snapshots snap ON snap.id = stu.snapshot_id
JOIN trips t ON t.id = snap.trip_id
JOIN routes r ON r.id = t.route_id
WHERE r.color = 'FFFF33'  -- Yellow line
  AND snap.snapshot_time > now() - interval '7 days'
  AND stu.arrival_delay IS NOT NULL;
```

### Delay heatmap by station and hour

Which stations are worst at which times?

```sql
SELECT
  parent.name AS station,
  extract(hour FROM snap.snapshot_time AT TIME ZONE 'America/Los_Angeles') AS hour,
  round(avg(stu.arrival_delay)) AS avg_delay_sec,
  count(*) AS samples
FROM stop_time_updates stu
JOIN trip_update_snapshots snap ON snap.id = stu.snapshot_id
JOIN stops platform ON platform.id = stu.stop_id
JOIN stops parent ON parent.id = platform.parent_station
WHERE snap.snapshot_time > now() - interval '7 days'
  AND stu.arrival_delay IS NOT NULL
  AND parent.location_type = 1
GROUP BY parent.name, extract(hour FROM snap.snapshot_time AT TIME ZONE 'America/Los_Angeles')
HAVING count(*) > 10
ORDER BY avg_delay_sec DESC
LIMIT 20;
```

### What changed in the last GTFS schedule update?

```sql
SELECT
  table_name,
  rows_added,
  rows_removed,
  rows_modified,
  details,
  created_at
FROM gtfs_static_audit_log
WHERE feed_version_new = (SELECT feed_version FROM feed_info ORDER BY fetched_at DESC LIMIT 1)
ORDER BY table_name;
```

---

## Data Volume Estimates

| Table | Growth Rate | 30-day estimate |
|---|---|---|
| `trip_update_snapshots` | ~70 rows/min | ~3M rows |
| `stop_time_updates` | ~1,400 rows/min | ~60M rows |
| `alerts` | ~3-10 active at a time | ~100 rows |
| `alert_versions` | A few per day | ~100 rows |
| `stop_times` | Static, replaced on update | ~38K rows |
| `shapes` | Static, replaced on update | ~28K rows |
| `trips` | Static, replaced on update | ~2.7K rows |

The time-series tables (`trip_update_snapshots`, `stop_time_updates`) will need a retention/cleanup strategy for production — either a periodic purge of data older than N days, or aggregation into a rollup table.
