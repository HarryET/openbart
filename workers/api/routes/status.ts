import { Hono } from "hono";
import { createDb } from "../../../db/client";
import { errorResponse } from "../lib/response";
import {
  buildLineSummaries,
  getActiveAlerts,
  getCurrentLineStatus,
  getHourlyHistory,
  isMainlineColor,
  levelFromAvgDelay,
  LINE_META,
  worstStatus,
  type LineStatusLevel,
} from "../lib/status-queries";
import type { AppEnv } from "../app";

export const statusRoutes = new Hono<AppEnv>();

// Compact overall summary — what the /status page hits first.
// Bundles current line status, 90-day on-time % per line, and active alert count.
statusRoutes.get("/status", async (c) => {
  const db = createDb(c.env);
  const [current, hourly, activeAlerts] = await Promise.all([
    getCurrentLineStatus(db),
    getHourlyHistory(db, 90),
    getActiveAlerts(db),
  ]);

  const lines = buildLineSummaries(current, hourly);
  const overallStatus = worstStatus(lines.map((l) => l.status));

  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    overallStatus,
    generatedAt: new Date().toISOString(),
    lines,
    activeAlertCount: activeAlerts.length,
  });
});

// Same line data as /status.lines, but in the standard items/pagination envelope
// so it matches the rest of the API.
statusRoutes.get("/status/lines", async (c) => {
  const db = createDb(c.env);
  const [current, hourly] = await Promise.all([
    getCurrentLineStatus(db),
    getHourlyHistory(db, 90),
  ]);
  const items = buildLineSummaries(current, hourly);

  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    items,
    pagination: { offset: 0, limit: items.length, total: items.length },
  });
});

// Full hourly history for one line. Used by the uptime bar component.
statusRoutes.get("/status/lines/:color/history", async (c) => {
  const color = c.req.param("color").toUpperCase();
  if (!isMainlineColor(color)) {
    return errorResponse(
      c,
      "NOT_FOUND",
      `Line '${color}' is not a tracked BART mainline`,
    );
  }

  const url = new URL(c.req.url);
  const rawDays = Number(url.searchParams.get("days") ?? "90");
  const days =
    Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 90
      ? Math.floor(rawDays)
      : 90;

  const db = createDb(c.env);
  const rows = await getHourlyHistory(db, days, color);

  const hourly = rows.map((r) => {
    const avgDelaySec = r.totalStops > 0 ? r.delaySum / r.totalStops : 0;
    const onTimePct = r.totalStops > 0 ? (100 * r.onTimeCount) / r.totalStops : 0;
    const status: LineStatusLevel = levelFromAvgDelay(
      avgDelaySec,
      r.totalStops,
    );
    return {
      hour: r.hour.toISOString(),
      avgDelaySec,
      onTimePct,
      maxDelay: r.maxDelay,
      status,
      samples: r.totalStops,
    };
  });

  const totalStops = rows.reduce((a, r) => a + r.totalStops, 0);
  const onTimeCount = rows.reduce((a, r) => a + r.onTimeCount, 0);
  const delaySum = rows.reduce((a, r) => a + r.delaySum, 0);

  const summary = {
    onTimePct: totalStops > 0 ? (100 * onTimeCount) / totalStops : null,
    avgDelaySec: totalStops > 0 ? delaySum / totalStops : null,
    totalSamples: totalStops,
  };

  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    color,
    name: LINE_META[color].name,
    displayColor: LINE_META[color].displayColor,
    days,
    hourly,
    summary,
  });
});

// Active (non-deleted) alerts. Thin wrapper over getActiveAlerts with duration.
statusRoutes.get("/status/alerts", async (c) => {
  const db = createDb(c.env);
  const items = await getActiveAlerts(db);

  c.header("Cache-Control", "public, max-age=30");
  return c.json({
    items,
    pagination: { offset: 0, limit: items.length, total: items.length },
  });
});
