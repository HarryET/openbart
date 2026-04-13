export type ArrivalRoute = {
  id: string;
  shortName: string | null;
  longName: string | null;
  color: string | null;
  textColor: string | null;
};

export type Arrival = {
  tripId: string;
  routeId: string;
  route: ArrivalRoute | null;
  headsign: string | null;
  directionId: number | null;
  stopId: string;
  platformCode: string | null;
  stopSequence: number;
  arrivalTime: string | null; // "HH:MM:SS"
  departureTime: string | null;
  realtime: {
    delay: number | null; // seconds
    uncertainty: number | null;
    predictedArrivalUnix: number | null;
  } | null;
};

function formatHm(hms: string | null): string {
  if (!hms) return "—";
  const [h, m] = hms.split(":");
  return `${h}:${m}`;
}

// Produce a concise countdown string given the arrival's best-known time.
// `tick` is the current Date.now() from the parent so all rows update together.
function countdownText(arrival: Arrival, tickMs: number): string {
  let targetMs: number | null = null;
  if (arrival.realtime?.predictedArrivalUnix) {
    targetMs = arrival.realtime.predictedArrivalUnix * 1000;
  } else if (arrival.arrivalTime) {
    // Fall back: parse HH:MM:SS as today in Pacific time.
    // For a rough UX-only countdown when no realtime is available.
    const [h, m, s] = arrival.arrivalTime.split(":").map((x) => Number(x));
    const now = new Date(tickMs);
    const target = new Date(now);
    target.setHours(h, m, s, 0);
    targetMs = target.getTime();
  }
  if (targetMs === null) return "—";

  const diffSec = Math.round((targetMs - tickMs) / 1000);
  if (diffSec <= 30) return "now";
  const mins = Math.ceil(diffSec / 60);
  if (mins <= 60) return `in ${mins} min`;
  // > 60 min: show HH:MM
  const t = new Date(targetMs);
  return t.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDelay(delaySec: number | null): { label: string; className: string } {
  if (delaySec === null)
    return { label: "no live data", className: "text-gray-400" };
  if (delaySec <= 60) return { label: "on time", className: "text-green-600" };
  const mins = Math.round(delaySec / 60);
  return { label: `+${mins} min`, className: "text-red-600" };
}

type Props = {
  arrival: Arrival;
  tickMs: number;
};

export function NextArrivalRow({ arrival, tickMs }: Props) {
  const delay = formatDelay(arrival.realtime?.delay ?? null);
  const color = arrival.route?.color ? `#${arrival.route.color}` : "#888";

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-200 last:border-b-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className="inline-block w-3 h-3 rounded-sm shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <span className="text-sm truncate">{arrival.headsign ?? "—"}</span>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className="text-sm font-bold">
          {countdownText(arrival, tickMs)}
        </span>
        <span className="text-[11px] text-gray-500">
          <span>{formatHm(arrival.arrivalTime)}</span>
          {" · "}
          <span className={delay.className}>{delay.label}</span>
        </span>
      </div>
    </div>
  );
}
