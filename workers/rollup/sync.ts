import { sql } from "drizzle-orm";
import type { createDb } from "../../db/client";

type Db = ReturnType<typeof createDb>;

// Hex colors of the 5 BART mainlines (matches routes.color values).
// Kept in sync with LINE_META in workers/api/lib/status-queries.ts.
const MAINLINE_COLORS = ["FFFF33", "FF9933", "339933", "FF0000", "0099CC"];

type RollupRow = {
  route_color: string;
  hour: string;
  total_stops: number;
  delay_sum: number;
  on_time_count: number;
  max_delay: number;
  snapshot_count: number;
};

// Recompute the current hour's line_status_hourly rows from raw data.
// Idempotent: deletes the current hour's rows, then inserts fresh aggregates.
// Past hours are never touched — once the hour ends, its row is frozen.
export async function syncHourlyRollup(db: Db) {
  const colorList = MAINLINE_COLORS.map((c) => `'${c}'`).join(",");

  const [rows] = (await db.execute(sql.raw(`
    SELECT
      r.color AS route_color,
      DATE_FORMAT(snap.snapshot_time, '%Y-%m-%d %H:00:00') AS hour,
      COUNT(*) AS total_stops,
      SUM(stu.arrival_delay) AS delay_sum,
      SUM(CASE WHEN stu.arrival_delay <= 60 THEN 1 ELSE 0 END) AS on_time_count,
      MAX(stu.arrival_delay) AS max_delay,
      COUNT(DISTINCT snap.id) AS snapshot_count
    FROM stop_time_updates stu
    JOIN trip_update_snapshots snap ON snap.id = stu.snapshot_id
    JOIN trips t ON t.id = snap.trip_id
    JOIN routes r ON r.id = t.route_id
    WHERE snap.snapshot_time >= DATE_FORMAT(NOW(), '%Y-%m-%d %H:00:00')
      AND stu.arrival_delay IS NOT NULL
      AND r.color IN (${colorList})
    GROUP BY r.color, DATE_FORMAT(snap.snapshot_time, '%Y-%m-%d %H:00:00')
  `))) as unknown as [RollupRow[], unknown];

  if (!rows || rows.length === 0) return;

  await db.execute(sql`
    DELETE FROM line_status_hourly
    WHERE hour = DATE_FORMAT(NOW(), '%Y-%m-%d %H:00:00')
  `);

  for (const row of rows) {
    await db.execute(sql`
      INSERT INTO line_status_hourly
        (route_color, hour, total_stops, delay_sum, on_time_count, max_delay, snapshot_count)
      VALUES
        (${row.route_color},
         ${row.hour},
         ${Number(row.total_stops)},
         ${Number(row.delay_sum)},
         ${Number(row.on_time_count)},
         ${Number(row.max_delay)},
         ${Number(row.snapshot_count)})
    `);
  }
}
