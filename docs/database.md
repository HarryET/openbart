# OpenBART Database Guide

## Data Sources

OpenBART pulls from three BART data feeds:

| Feed | URL | Frequency | Format |
|---|---|---|---|
| GTFS-RT Alerts | `https://api.bart.gov/gtfsrt/alerts.aspx` | Every minute | Protobuf |
| GTFS-RT Trip Updates | `https://api.bart.gov/gtfsrt/tripupdate.aspx` | Every minute | Protobuf |
| GTFS Static | `https://www.bart.gov/dev/schedules/google_transit.zip` | Daily (07:15 UTC) | ZIP of CSVs |

Both realtime feeds are decoded using `gtfs-realtime-bindings`. The static feed is unzipped with `fflate` and parsed with `papaparse`.

**Database:** MySQL (PlanetScale / Vitess). No foreign key constraints (Vitess limitation) — relationships are enforced at the application layer.

---

## Tables

### GTFS Static Reference Tables

These tables mirror the official GTFS spec. They're populated by the daily cron and represent BART's published schedule. Changes are detected by comparing the `feed_version` field — if unchanged, the sync is skipped entirely.

#### `agencies`

One row. It's BART.

| Column | Type | Example |
|---|---|---|
| `id` | varchar(255) PK | `"BART"` |
| `name` | varchar(255) | `"Bay Area Rapid Transit"` |
| `url` | text | `"https://www.bart.gov/"` |
| `timezone` | varchar(255) | `"America/Los_Angeles"` |
| `phone` | varchar(50) | `"510-464-6000"` |

**Source:** `agency.txt` from GTFS static ZIP
**Sync:** Diff-based upsert. Audit log includes full row details on change.

#### `routes`

BART's rail lines. Each direction is a separate route (e.g., Yellow-S and Yellow-N).

| Column | Type | Example |
|---|---|---|
| `id` | varchar(255) PK | `"1"` |
| `agency_id` | varchar(255) | `"BART"` |
| `short_name` | varchar(255) | `"Yellow-S"` |
| `long_name` | text | `"Antioch to SF Int'l Airport SFO/Millbrae"` |
| `type` | int | `1` (rail) |
| `color` | varchar(20) | `"FFFF33"` |
| `text_color` | varchar(20) | `"000000"` |

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
| `id` | varchar(255) PK | `"M10-1"` |
| `name` | varchar(255) | `"Embarcadero"` |
| `lat` | decimal(12,8) | `37.79276200` |
| `lon` | decimal(12,8) | `-122.39703700` |
| `parent_station` | varchar(255) | `"EMBR"` (links platform → station) |
| `platform_code` | varchar(20) | `"1"` |
| `location_type` | int | `0` |

**Source:** `stops.txt`
**Sync:** Diff-based upsert.

#### `trips`

Every scheduled trip for the current timetable period (~2,700 rows).

| Column | Type | Example |
|---|---|---|
| `id` | varchar(255) PK | `"1850208"` |
| `route_id` | varchar(255) | `"5"` (Green-S) |
| `service_id` | varchar(255) | `"2026_01_12-DX-MVS-Weekday-001"` |
| `trip_headsign` | text | `"OAK Airport / SF / Daly City"` |
| `direction_id` | int | `1` (South) |
| `block_id` | varchar(255) | |
| `shape_id` | varchar(255) | `"005A_shp"` |

**Source:** `trips.txt`
**Sync:** Diff-based upsert. This is the key join table — realtime trip updates reference these trip IDs.

#### `stop_times`

Scheduled arrival/departure at each stop for every trip (~38,000 rows).

| Column | Type | Example |
|---|---|---|
| `id` | int auto_increment PK | |
| `trip_id` | varchar(255) | `"1850208"` |
| `stop_id` | varchar(255) | `"M10-1"` |
| `arrival_time` | varchar(10) | `"06:43:00"` |
| `departure_time` | varchar(10) | `"06:43:00"` |
| `stop_sequence` | int | `7` |
| `pickup_type` | int | |
| `drop_off_type` | int | |

Times are stored as varchar because GTFS allows times >24:00:00 (e.g., `"25:30:00"` for a trip that started before midnight).

**Source:** `stop_times.txt`
**Sync:** Delete-and-reinsert (no natural PK). Batch inserted in chunks of 1,000.
**Indexes:** `(trip_id, stop_sequence)`, `(stop_id)`

#### `calendar`

Which days each service pattern runs.

| Column | Type | Example |
|---|---|---|
| `service_id` | varchar(255) PK | `"2026_01_12-DX-MVS-Weekday-001"` |
| `monday`–`sunday` | int | `1` or `0` |
| `start_date` | varchar(8) | `"20260112"` |
| `end_date` | varchar(8) | `"20260807"` |

**Source:** `calendar.txt`
**Sync:** Diff-based upsert.

#### `calendar_dates`

Holiday exceptions to the regular calendar.

| Column | Type | Example |
|---|---|---|
| `id` | int auto_increment PK | |
| `service_id` | varchar(255) | `"2026_01_12-DX-MVS-Weekday-001"` |
| `date` | varchar(8) | `"20260525"` (Memorial Day) |
| `exception_type` | int | `2` (service removed) |

**Source:** `calendar_dates.txt`
**Sync:** Delete-and-reinsert.

#### `shapes`

Geographic coordinates tracing each route's path (~28,000 points).

| Column | Type | Example |
|---|---|---|
| `id` | int auto_increment PK | |
| `shape_id` | varchar(255) | `"001A_shp"` |
| `shape_pt_lat` | decimal(12,8) | `37.99538897` |
| `shape_pt_lon` | decimal(12,8) | `-121.78043433` |
| `shape_pt_sequence` | int | `1` |
| `shape_dist_traveled` | decimal(12,4) | `0` |

**Source:** `shapes.txt`
**Sync:** Delete-and-reinsert in chunks of 1,000.
**Index:** `(shape_id, shape_pt_sequence)`

#### `transfers`

Where riders can transfer between lines (~30 rows).

| Column | Type | Example |
|---|---|---|
| `id` | int auto_increment PK | |
| `from_stop_id` | varchar(255) | `"K30-2"` (MacArthur platform 2) |
| `to_stop_id` | varchar(255) | `"K30-4"` (MacArthur platform 4) |
| `transfer_type` | int | `2` (timed transfer) |
| `min_transfer_time` | int | `30` (seconds) |

**Source:** `transfers.txt`
**Sync:** Delete-and-reinsert.

#### `feed_info`

Tracks which version of the GTFS static data is loaded. Used for change detection.

| Column | Type | Example |
|---|---|---|
| `id` | int auto_increment PK | |
| `feed_version` | varchar(255) | `"72"` |
| `feed_publisher_name` | text | `"Bay Area Rapid Transit"` |
| `feed_start_date` | varchar(8) | `"20260112"` |
| `feed_end_date` | varchar(8) | `"20260807"` |
| `fetched_at` | timestamp | `2026-04-12 07:15:00` |

**Sync:** A new row is inserted each time a new feed version is detected. The daily cron compares the latest row's `feed_version` against the downloaded ZIP — if they match, no work is done.

#### `gtfs_static_audit_log`

Records what changed each time the static data is updated.

| Column | Type | Example |
|---|---|---|
| `id` | int auto_increment PK | |
| `feed_version_old` | varchar(255) | `"71"` |
| `feed_version_new` | varchar(255) | `"72"` |
| `table_name` | varchar(255) | `"routes"` |
| `rows_added` | int | `2` |
| `rows_removed` | int | `0` |
| `rows_modified` | int | `1` |
| `details` | json | `[{"action":"added","key":"BB-A","new":{...}}, ...]` |
| `created_at` | timestamp | |

For small tables (agencies, routes, stops, calendar), `details` contains full row-level diffs. For large tables (stop_times, shapes), `details` is null and only counts are recorded.

---

### Realtime Tables

#### `alerts`

Current and historical BART service alerts, soft-deleted when they disappear from the feed.

| Column | Type | Example |
|---|---|---|
| `id` | int auto_increment PK | |
| `feed_entity_id` | varchar(255), unique | `"BSA_291059"` |
| `header_text` | text | `"BART.gov Alert"` |
| `description_text` | text | `"10-minute delay on the Berryessa Line..."` |
| `url` | text | `"http://www.bart.gov/schedules/advisories"` |
| `cause` | int | `1` (UNKNOWN_CAUSE) |
| `effect` | int | `8` (UNKNOWN_EFFECT) |
| `severity_level` | int | `1` (UNKNOWN_SEVERITY) |
| `active_periods` | json | `[]` (BART doesn't set these) |
| `created_at` | timestamp | first time we saw it |
| `updated_at` | timestamp | last time it appeared in the feed |
| `deleted_at` | timestamp, nullable | when it disappeared from the feed |

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
| `id` | int auto_increment PK | |
| `alert_id` | int | |
| `agency_id` | varchar(255) | `"BART"` |
| `route_id` | varchar(255) | |
| `stop_id` | varchar(255) | |
| `direction_id` | int | |
| `route_type` | int | |
| `trip_id` | varchar(255) | |

Currently BART only populates `agency_id = "BART"` on all alerts (not granular by route/stop).

#### `alert_versions`

Immutable snapshots recorded each time an alert's content changes. Enables time-travel through an alert's history.

| Column | Type |
|---|---|
| `id` | int auto_increment PK |
| `alert_id` | int |
| `header_text` | text |
| `description_text` | text |
| `url` | text |
| `cause`, `effect`, `severity_level` | int |
| `active_periods` | json |
| `informed_entities` | json (snapshot of entities at this point) |
| `created_at` | timestamp |

A version is recorded when: an alert first appears, its content changes, or it reappears after deletion with different content.

#### `trip_update_snapshots`

One row per active train per minute. This is append-only time-series data.

| Column | Type | Example |
|---|---|---|
| `id` | int auto_increment PK | |
| `trip_id` | varchar(255) | `"1850208"` |
| `vehicle_label` | varchar(50) | `"3-door"` |
| `schedule_relationship` | int | `0` (SCHEDULED) |
| `feed_timestamp` | int | |
| `snapshot_time` | timestamp | `2026-04-12 16:57:00` |

~70 rows inserted per minute (one per active train).

**Indexes:** `(trip_id, snapshot_time)`, `(snapshot_time)`

#### `stop_time_updates`

Per-stop delay and timing data for each train snapshot. The core data for delay analysis.

| Column | Type | Example |
|---|---|---|
| `id` | int auto_increment PK | |
| `snapshot_id` | int | |
| `stop_id` | varchar(255) | `"A70-2"` (South Hayward, platform 2) |
| `stop_sequence` | int | `0` |
| `arrival_delay` | int | `109` (seconds late) |
| `arrival_time` | int | `1776038452` (unix timestamp) |
| `arrival_uncertainty` | int | `30` |
| `departure_delay` | int | `109` |
| `departure_time` | int | `1776038470` |
| `departure_uncertainty` | int | `30` |
| `schedule_relationship` | int | |

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
  COUNT(*) AS total_stops,
  ROUND(AVG(stu.arrival_delay)) AS avg_delay_sec,
  ROUND(
    100.0 * SUM(CASE WHEN stu.arrival_delay <= 60 THEN 1 ELSE 0 END) / COUNT(*),
    1
  ) AS on_time_pct,
  MAX(stu.arrival_delay) AS worst_delay_sec,
  CASE
    WHEN AVG(stu.arrival_delay) <= 60 THEN 'operational'
    WHEN AVG(stu.arrival_delay) <= 300 THEN 'degraded'
    ELSE 'outage'
  END AS status
FROM stop_time_updates stu
JOIN trip_update_snapshots snap ON snap.id = stu.snapshot_id
JOIN trips t ON t.id = snap.trip_id
JOIN routes r ON r.id = t.route_id
WHERE snap.snapshot_time > NOW() - INTERVAL 5 MINUTE
  AND stu.arrival_delay IS NOT NULL
GROUP BY r.short_name, r.color
ORDER BY avg_delay_sec DESC;
```

### Hourly status timeline (for uptime-style bars)

```sql
SELECT
  r.short_name,
  r.color,
  DATE_FORMAT(snap.snapshot_time, '%Y-%m-%d %H:00:00') AS hour,
  ROUND(AVG(stu.arrival_delay)) AS avg_delay_sec,
  ROUND(
    100.0 * SUM(CASE WHEN stu.arrival_delay <= 60 THEN 1 ELSE 0 END) / COUNT(*),
    1
  ) AS on_time_pct,
  CASE
    WHEN AVG(stu.arrival_delay) <= 60 THEN 'operational'
    WHEN AVG(stu.arrival_delay) <= 300 THEN 'degraded'
    ELSE 'outage'
  END AS status
FROM stop_time_updates stu
JOIN trip_update_snapshots snap ON snap.id = stu.snapshot_id
JOIN trips t ON t.id = snap.trip_id
JOIN routes r ON r.id = t.route_id
WHERE snap.snapshot_time > NOW() - INTERVAL 24 HOUR
  AND stu.arrival_delay IS NOT NULL
GROUP BY r.short_name, r.color, DATE_FORMAT(snap.snapshot_time, '%Y-%m-%d %H:00:00')
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
  FROM_UNIXTIME(stu.arrival_time) AS expected_arrival
FROM trip_update_snapshots snap
JOIN stop_time_updates stu ON stu.snapshot_id = snap.id
JOIN trips t ON t.id = snap.trip_id
JOIN routes r ON r.id = t.route_id
JOIN stops s ON s.id = stu.stop_id
WHERE snap.snapshot_time = (
  SELECT MAX(snapshot_time) FROM trip_update_snapshots
)
AND stu.stop_sequence = (
  SELECT MIN(stu2.stop_sequence)
  FROM stop_time_updates stu2
  WHERE stu2.snapshot_id = snap.id
    AND stu2.arrival_time > UNIX_TIMESTAMP(NOW())
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
  TIMESTAMPDIFF(MINUTE, created_at, NOW()) AS duration_minutes
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
SELECT
  r.short_name AS line,
  r.color,
  t.trip_headsign AS destination,
  st.departure_time AS scheduled_time,
  stu.departure_delay AS delay_sec,
  CONCAT(
    st.departure_time,
    CASE
      WHEN stu.departure_delay IS NOT NULL AND stu.departure_delay > 60
      THEN CONCAT(' (+', FLOOR(stu.departure_delay / 60), ' min)')
      ELSE ''
    END
  ) AS display_time
FROM stop_times st
JOIN trips t ON t.id = st.trip_id
JOIN routes r ON r.id = t.route_id
JOIN calendar c ON c.service_id = t.service_id
LEFT JOIN trip_update_snapshots snap
  ON snap.trip_id = st.trip_id
  AND snap.snapshot_time = (SELECT MAX(snapshot_time) FROM trip_update_snapshots)
LEFT JOIN stop_time_updates stu
  ON stu.snapshot_id = snap.id
  AND stu.stop_sequence = st.stop_sequence
WHERE st.stop_id IN (
  SELECT id FROM stops WHERE parent_station = 'EMBR'
)
AND c.start_date <= DATE_FORMAT(CONVERT_TZ(NOW(), 'UTC', 'America/Los_Angeles'), '%Y%m%d')
AND c.end_date >= DATE_FORMAT(CONVERT_TZ(NOW(), 'UTC', 'America/Los_Angeles'), '%Y%m%d')
AND CASE DAYOFWEEK(CONVERT_TZ(NOW(), 'UTC', 'America/Los_Angeles'))
  WHEN 1 THEN c.sunday
  WHEN 2 THEN c.monday
  WHEN 3 THEN c.tuesday
  WHEN 4 THEN c.wednesday
  WHEN 5 THEN c.thursday
  WHEN 6 THEN c.friday
  WHEN 7 THEN c.saturday
END = 1
AND st.departure_time > DATE_FORMAT(CONVERT_TZ(NOW(), 'UTC', 'America/Los_Angeles'), '%H:%i:%s')
ORDER BY st.departure_time
LIMIT 10;
```

### How often is the Yellow line late? (past 7 days)

```sql
SELECT
  COUNT(*) AS total_observations,
  SUM(CASE WHEN stu.arrival_delay <= 60 THEN 1 ELSE 0 END) AS on_time,
  SUM(CASE WHEN stu.arrival_delay BETWEEN 61 AND 300 THEN 1 ELSE 0 END) AS minor_delay,
  SUM(CASE WHEN stu.arrival_delay BETWEEN 301 AND 600 THEN 1 ELSE 0 END) AS moderate_delay,
  SUM(CASE WHEN stu.arrival_delay > 600 THEN 1 ELSE 0 END) AS major_delay,
  ROUND(
    100.0 * SUM(CASE WHEN stu.arrival_delay <= 60 THEN 1 ELSE 0 END) / COUNT(*),
    1
  ) AS on_time_pct
FROM stop_time_updates stu
JOIN trip_update_snapshots snap ON snap.id = stu.snapshot_id
JOIN trips t ON t.id = snap.trip_id
JOIN routes r ON r.id = t.route_id
WHERE r.color = 'FFFF33'
  AND snap.snapshot_time > NOW() - INTERVAL 7 DAY
  AND stu.arrival_delay IS NOT NULL;
```

### Delay heatmap by station and hour

Which stations are worst at which times?

```sql
SELECT
  parent.name AS station,
  HOUR(CONVERT_TZ(snap.snapshot_time, 'UTC', 'America/Los_Angeles')) AS hour,
  ROUND(AVG(stu.arrival_delay)) AS avg_delay_sec,
  COUNT(*) AS samples
FROM stop_time_updates stu
JOIN trip_update_snapshots snap ON snap.id = stu.snapshot_id
JOIN stops platform ON platform.id = stu.stop_id
JOIN stops parent ON parent.id = platform.parent_station
WHERE snap.snapshot_time > NOW() - INTERVAL 7 DAY
  AND stu.arrival_delay IS NOT NULL
  AND parent.location_type = 1
GROUP BY parent.name, HOUR(CONVERT_TZ(snap.snapshot_time, 'UTC', 'America/Los_Angeles'))
HAVING COUNT(*) > 10
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
