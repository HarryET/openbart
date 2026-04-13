export type OverallStatusLevel =
  | "operational"
  | "degraded"
  | "outage"
  | "no_data"
  | "loading";

const STYLES: Record<
  OverallStatusLevel,
  { bg: string; text: string; label: string }
> = {
  operational: {
    bg: "bg-green-500",
    text: "text-white",
    label: "All Systems Operational",
  },
  degraded: {
    bg: "bg-amber-500",
    text: "text-black",
    label: "Degraded Performance",
  },
  outage: {
    bg: "bg-red-500",
    text: "text-white",
    label: "Major Outage",
  },
  no_data: {
    bg: "bg-gray-300",
    text: "text-black",
    label: "No Data Available",
  },
  loading: {
    bg: "bg-gray-200",
    text: "text-gray-600",
    label: "Checking status…",
  },
};

type Props = {
  status: OverallStatusLevel;
  generatedAt?: string;
  error?: boolean;
};

export function OverallStatus({ status, generatedAt, error }: Props) {
  const resolved = error ? "no_data" : status;
  const style = STYLES[resolved];
  const label = error ? "Status unavailable" : style.label;

  const timeText = generatedAt
    ? new Date(generatedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : null;

  return (
    <div
      className={`rounded px-4 py-4 text-center ${style.bg} ${style.text}`}
      role="status"
    >
      <p className="text-lg font-bold">{label}</p>
      {timeText && !error && (
        <p className="text-xs mt-1 opacity-80">As of {timeText}</p>
      )}
    </div>
  );
}
