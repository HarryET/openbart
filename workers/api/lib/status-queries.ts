import { desc, isNull, sql } from "drizzle-orm";
import type { createDb } from "../../../db/client";
import { alerts } from "../../../db/schema";

type Db = ReturnType<typeof createDb>;

// Status thresholds (matches docs/database.md example queries)
export const ON_TIME_THRESHOLD_SEC = 60;
export const DEGRADED_THRESHOLD_SEC = 300;

export type LineStatusLevel =
  | "operational"
  | "degraded"
  | "outage"
  | "no_data";

export function levelFromAvgDelay(
  avgDelaySec: number | null,
  totalStops: number,
): LineStatusLevel {
  if (totalStops === 0 || avgDelaySec === null) return "no_data";
  if (avgDelaySec <= ON_TIME_THRESHOLD_SEC) return "operational";
  if (avgDelaySec <= DEGRADED_THRESHOLD_SEC) return "degraded";
  return "outage";
}

// Worst-of-many reducer for the page's overall banner.
// outage > degraded > operational > no_data
const SEVERITY: Record<LineStatusLevel, number> = {
  no_data: 0,
  operational: 1,
  degraded: 2,
  outage: 3,
};

export function worstStatus(
  levels: LineStatusLevel[],
): LineStatusLevel {
  let worst: LineStatusLevel = "operational";
  for (const l of levels) {
    if (SEVERITY[l] > SEVERITY[worst]) worst = l;
  }
  return worst;
}

// The 5 BART mainlines shown on the status page.
// Colors match routes.color in the DB. Ordered by route_id convention.
export const LINE_META: Record<
  string,
  { name: string; displayColor: string; order: number }
> = {
  FFFF33: { name: "Yellow Line", displayColor: "#ffd700", order: 0 },
  FF9933: { name: "Orange Line", displayColor: "#ff6600", order: 1 },
  "339933": { name: "Green Line", displayColor: "#339933", order: 2 },
  FF0000: { name: "Red Line", displayColor: "#d40000", order: 3 },
  "0099CC": { name: "Blue Line", displayColor: "#0099cc", order: 4 },
};

export const MAINLINE_COLORS = Object.keys(LINE_META);

export function isMainlineColor(color: string): boolean {
  return color in LINE_META;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export type CurrentLineRow = {
  color: string;
  avgDelaySec: number;
  onTimePct: number;
  totalStops: number;
  status: LineStatusLevel;
};

// Live status per line, averaged over the last 5 minutes of raw data.
// Uses the indexed snapshot_time on trip_update_snapshots so the scan is small.
export async function getCurrentLineStatus(db: Db): Promise<CurrentLineRow[]> {
  const colorList = MAINLINE_COLORS.map((c) => `'${c}'`).join(",");

  const [rows] = (await db.execute(sql.raw(`
    SELECT
      r.color AS color,
      COUNT(*) AS total_stops,
      ROUND(AVG(stu.arrival_delay)) AS avg_delay_sec,
      SUM(CASE WHEN stu.arrival_delay <= ${ON_TIME_THRESHOLD_SEC} THEN 1 ELSE 0 END) AS on_time_count
    FROM stop_time_updates stu
    JOIN trip_update_snapshots snap ON snap.id = stu.snapshot_id
    JOIN trips t ON t.id = snap.trip_id
    JOIN routes r ON r.id = t.route_id
    WHERE snap.snapshot_time > NOW() - INTERVAL 5 MINUTE
      AND stu.arrival_delay IS NOT NULL
      AND r.color IN (${colorList})
    GROUP BY r.color
  `))) as unknown as [
    {
      color: string;
      total_stops: number | string;
      avg_delay_sec: number | string | null;
      on_time_count: number | string;
    }[],
    unknown,
  ];

  const byColor = new Map<string, CurrentLineRow>();
  for (const row of rows ?? []) {
    const totalStops = Number(row.total_stops);
    const avg = row.avg_delay_sec === null ? 0 : Number(row.avg_delay_sec);
    const onTime = Number(row.on_time_count);
    byColor.set(row.color, {
      color: row.color,
      avgDelaySec: avg,
      onTimePct: totalStops > 0 ? (100 * onTime) / totalStops : 0,
      totalStops,
      status: levelFromAvgDelay(avg, totalStops),
    });
  }

  // Ensure all 5 mainlines are present, filling in no_data for any that are
  // missing from the window (e.g. very quiet overnight periods).
  return MAINLINE_COLORS.map(
    (color): CurrentLineRow =>
      byColor.get(color) ?? {
        color,
        avgDelaySec: 0,
        onTimePct: 0,
        totalStops: 0,
        status: "no_data",
      },
  );
}

export type HourlyHistoryRow = {
  color: string;
  hour: Date;
  totalStops: number;
  delaySum: number;
  onTimeCount: number;
  maxDelay: number;
};

// 90-day (or configurable) hourly history from the rollup table.
// ~2,160 rows per color max — tiny, cheap scan.
export async function getHourlyHistory(
  db: Db,
  days: number,
  colorFilter?: string,
): Promise<HourlyHistoryRow[]> {
  const safeDays = Math.max(1, Math.min(90, Math.floor(days)));
  const colorClause = colorFilter
    ? `AND route_color = '${colorFilter}'`
    : `AND route_color IN (${MAINLINE_COLORS.map((c) => `'${c}'`).join(",")})`;

  const [rows] = (await db.execute(sql.raw(`
    SELECT
      route_color AS color,
      hour,
      total_stops,
      delay_sum,
      on_time_count,
      max_delay
    FROM line_status_hourly
    WHERE hour > NOW() - INTERVAL ${safeDays} DAY
      ${colorClause}
    ORDER BY route_color, hour
  `))) as unknown as [
    {
      color: string;
      hour: Date | string;
      total_stops: number | string;
      delay_sum: number | string;
      on_time_count: number | string;
      max_delay: number | string;
    }[],
    unknown,
  ];

  return (rows ?? []).map((r) => ({
    color: r.color,
    hour: r.hour instanceof Date ? r.hour : new Date(r.hour),
    totalStops: Number(r.total_stops),
    delaySum: Number(r.delay_sum),
    onTimeCount: Number(r.on_time_count),
    maxDelay: Number(r.max_delay),
  }));
}

export type ActiveAlertRow = {
  id: number;
  feedEntityId: string;
  headerText: string | null;
  descriptionText: string | null;
  url: string | null;
  cause: number | null;
  effect: number | null;
  severityLevel: number | null;
  createdAt: Date;
  updatedAt: Date;
  durationMinutes: number;
};

export async function getActiveAlerts(db: Db): Promise<ActiveAlertRow[]> {
  const rows = await db
    .select({
      id: alerts.id,
      feedEntityId: alerts.feedEntityId,
      headerText: alerts.headerText,
      descriptionText: alerts.descriptionText,
      url: alerts.url,
      cause: alerts.cause,
      effect: alerts.effect,
      severityLevel: alerts.severityLevel,
      createdAt: alerts.createdAt,
      updatedAt: alerts.updatedAt,
    })
    .from(alerts)
    .where(isNull(alerts.deletedAt))
    .orderBy(desc(alerts.createdAt));

  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    durationMinutes: Math.max(
      0,
      Math.floor((now - new Date(r.createdAt).getTime()) / 60_000),
    ),
  }));
}

// ---------------------------------------------------------------------------
// Shaping helpers for API responses
// ---------------------------------------------------------------------------

export type LineSummary = {
  color: string;
  name: string;
  displayColor: string;
  status: LineStatusLevel;
  avgDelaySec: number;
  onTimePct: number;         // last 5 min
  onTimePct90d: number | null; // 90-day reliability ("nines")
  avgDelaySec90d: number | null;
};

export function buildLineSummaries(
  current: CurrentLineRow[],
  hourly: HourlyHistoryRow[],
): LineSummary[] {
  const totalsByColor = new Map<
    string,
    { totalStops: number; onTimeCount: number; delaySum: number }
  >();
  for (const h of hourly) {
    const t = totalsByColor.get(h.color) ?? {
      totalStops: 0,
      onTimeCount: 0,
      delaySum: 0,
    };
    t.totalStops += h.totalStops;
    t.onTimeCount += h.onTimeCount;
    t.delaySum += h.delaySum;
    totalsByColor.set(h.color, t);
  }

  return current
    .map((c): LineSummary => {
      const meta = LINE_META[c.color];
      const totals = totalsByColor.get(c.color);
      const onTimePct90d =
        totals && totals.totalStops > 0
          ? (100 * totals.onTimeCount) / totals.totalStops
          : null;
      const avgDelaySec90d =
        totals && totals.totalStops > 0
          ? totals.delaySum / totals.totalStops
          : null;
      return {
        color: c.color,
        name: meta?.name ?? c.color,
        displayColor: meta?.displayColor ?? "#000000",
        status: c.status,
        avgDelaySec: c.avgDelaySec,
        onTimePct: c.onTimePct,
        onTimePct90d,
        avgDelaySec90d,
      };
    })
    .sort(
      (a, b) => (LINE_META[a.color]?.order ?? 99) - (LINE_META[b.color]?.order ?? 99),
    );
}
