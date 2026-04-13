export type HourlyPoint = {
  hour: string; // ISO timestamp
  avgDelaySec: number;
  onTimePct: number;
  maxDelay: number;
  status: "operational" | "degraded" | "outage" | "no_data";
  samples: number;
};

type DayBucket = {
  date: string; // yyyy-mm-dd (local)
  label: string; // "Apr 12"
  status: "operational" | "degraded" | "outage" | "no_data";
  totalSamples: number;
  onTimePct: number | null;
  avgDelaySec: number | null;
};

const STATUS_COLOR: Record<DayBucket["status"], string> = {
  operational: "#22c55e",
  degraded: "#f59e0b",
  outage: "#ef4444",
  no_data: "#e5e7eb",
};

const SEVERITY = { no_data: 0, operational: 1, degraded: 2, outage: 3 } as const;

// Group hourly points into 90 day buckets ending today (local time).
// Each day's status is the worst hourly status seen that day.
function bucketByDay(hourly: HourlyPoint[]): DayBucket[] {
  const byDate = new Map<
    string,
    {
      worst: DayBucket["status"];
      totalSamples: number;
      onTimeSum: number;
      delaySum: number;
      sampleCount: number;
    }
  >();

  for (const p of hourly) {
    const d = new Date(p.hour);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(d.getDate()).padStart(2, "0")}`;
    const existing = byDate.get(dateKey) ?? {
      worst: "no_data" as DayBucket["status"],
      totalSamples: 0,
      onTimeSum: 0,
      delaySum: 0,
      sampleCount: 0,
    };
    if (SEVERITY[p.status] > SEVERITY[existing.worst]) existing.worst = p.status;
    existing.totalSamples += p.samples;
    existing.onTimeSum += (p.onTimePct / 100) * p.samples;
    existing.delaySum += p.avgDelaySec * p.samples;
    existing.sampleCount += p.samples;
    byDate.set(dateKey, existing);
  }

  // Walk back 90 days from today, filling gaps with no_data.
  const days: DayBucket[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(d.getDate()).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const agg = byDate.get(dateKey);
    days.push({
      date: dateKey,
      label,
      status: agg?.worst ?? "no_data",
      totalSamples: agg?.totalSamples ?? 0,
      onTimePct:
        agg && agg.sampleCount > 0 ? (agg.onTimeSum / agg.sampleCount) * 100 : null,
      avgDelaySec:
        agg && agg.sampleCount > 0 ? agg.delaySum / agg.sampleCount : null,
    });
  }
  return days;
}

function formatTooltip(day: DayBucket): string {
  if (day.status === "no_data" || day.onTimePct === null) {
    return `${day.label} · no data`;
  }
  const pct = day.onTimePct.toFixed(1);
  const delay = Math.round(day.avgDelaySec ?? 0);
  return `${day.label} · ${pct}% on-time · avg delay ${delay}s`;
}

type UptimeBarProps = {
  hourly?: HourlyPoint[];
  loading?: boolean;
};

export function UptimeBar({ hourly, loading }: UptimeBarProps) {
  // While loading (or when we have no data yet), show 90 neutral bars
  // so the layout doesn't shift when data arrives.
  const days: DayBucket[] = loading || !hourly
    ? Array.from({ length: 90 }, (_, i) => ({
        date: `placeholder-${i}`,
        label: "",
        status: "no_data" as const,
        totalSamples: 0,
        onTimePct: null,
        avgDelaySec: null,
      }))
    : bucketByDay(hourly);

  return (
    <div
      className="flex gap-[2px] h-[34px] w-full"
      role="img"
      aria-label="90 day uptime history"
    >
      {days.map((day) => (
        <div
          key={day.date}
          title={loading ? "" : formatTooltip(day)}
          className="flex-1 rounded-[2px]"
          style={{
            backgroundColor: STATUS_COLOR[day.status],
            opacity: loading ? 0.4 : 1,
          }}
        />
      ))}
    </div>
  );
}
