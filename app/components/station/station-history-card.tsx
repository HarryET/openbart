export type StationHistory = {
  stopId: string;
  days: number;
  totalSamples: number;
  onTimePct: number | null;
  avgDelaySec: number | null;
  worstDelaySec: number | null;
  majorDelayCount: number;
};

function onTimeColor(pct: number | null): string {
  if (pct === null) return "bg-gray-200 text-gray-600";
  if (pct >= 95) return "bg-green-500 text-white";
  if (pct >= 85) return "bg-amber-500 text-black";
  return "bg-red-500 text-white";
}

type Props = {
  history?: StationHistory;
  loading?: boolean;
  error?: boolean;
};

export function StationHistoryCard({ history, loading, error }: Props) {
  if (error) {
    return (
      <div className="border border-gray-300 rounded p-3 bg-gray-50 text-xs text-gray-600">
        Historical stats unavailable.
      </div>
    );
  }

  if (loading || !history) {
    return (
      <div className="border border-gray-300 rounded p-3 bg-gray-50 text-xs text-gray-400">
        Loading history…
      </div>
    );
  }

  const pct = history.onTimePct;
  const pill = onTimeColor(pct);
  const pctText = pct === null ? "—" : `${pct.toFixed(2)} %`;
  const avgDelay =
    history.avgDelaySec === null ? "—" : `${Math.round(history.avgDelaySec)}s`;
  const worstDelay =
    history.worstDelaySec === null
      ? "—"
      : `${Math.round(history.worstDelaySec / 60)} min`;

  return (
    <div className="border border-gray-200 rounded p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block px-2 py-1 rounded text-sm font-bold ${pill}`}
          >
            {pctText}
          </span>
          <span className="text-sm">on-time (last {history.days}d)</span>
        </div>
        <div className="text-xs text-gray-600 flex gap-4">
          <span>
            avg delay <span className="font-bold text-black">{avgDelay}</span>
          </span>
          <span>
            worst <span className="font-bold text-black">{worstDelay}</span>
          </span>
          <span>
            major delays{" "}
            <span className="font-bold text-black">
              {history.majorDelayCount}
            </span>
          </span>
          <span className="text-gray-400">
            ({history.totalSamples.toLocaleString()} samples)
          </span>
        </div>
      </div>
    </div>
  );
}
