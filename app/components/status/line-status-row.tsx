import { UptimeBar, type HourlyPoint } from "./uptime-bar";

export type LineSummary = {
  color: string;
  name: string;
  displayColor: string;
  status: "operational" | "degraded" | "outage" | "no_data";
  avgDelaySec: number;
  onTimePct: number;
  onTimePct90d: number | null;
  avgDelaySec90d: number | null;
};

const STATUS_LABEL: Record<LineSummary["status"], string> = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
  no_data: "No Data",
};

const STATUS_TEXT_COLOR: Record<LineSummary["status"], string> = {
  operational: "text-green-600",
  degraded: "text-amber-600",
  outage: "text-red-600",
  no_data: "text-gray-400",
};

type Props = {
  line: LineSummary;
  hourly?: HourlyPoint[];
  loadingHistory?: boolean;
};

export function LineStatusRow({ line, hourly, loadingHistory }: Props) {
  const onTimeDisplay =
    line.onTimePct90d !== null ? `${line.onTimePct90d.toFixed(2)} %` : "—";

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: line.displayColor }}
            aria-hidden="true"
          />
          <span className="text-sm font-bold">{line.name}</span>
        </div>
        <span
          className={`text-xs font-bold uppercase tracking-wide ${STATUS_TEXT_COLOR[line.status]}`}
        >
          {STATUS_LABEL[line.status]}
        </span>
      </div>

      <UptimeBar hourly={hourly} loading={loadingHistory} />

      <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500">
        <span>90 days ago</span>
        <span className="font-bold text-gray-700">
          {onTimeDisplay} on-time
        </span>
        <span>Today</span>
      </div>
    </section>
  );
}
