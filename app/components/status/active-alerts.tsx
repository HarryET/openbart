export type ActiveAlert = {
  id: number;
  headerText: string | null;
  descriptionText: string | null;
  url: string | null;
  createdAt: string;
  durationMinutes: number;
};

function formatDuration(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type Props = {
  alerts: ActiveAlert[];
};

export function ActiveAlerts({ alerts }: Props) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-sm font-bold mb-2">
        Active alerts ({alerts.length})
      </h2>
      <div className="space-y-2">
        {alerts.map((a) => (
          <div
            key={a.id}
            className="border border-gray-300 rounded p-3 bg-gray-50"
          >
            {a.headerText && (
              <p className="text-sm font-bold">{a.headerText}</p>
            )}
            {a.descriptionText && (
              <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap">
                {a.descriptionText}
              </p>
            )}
            <p className="text-[11px] text-gray-500 mt-2">
              Started {formatDuration(a.durationMinutes)}
              {a.url && (
                <>
                  {" · "}
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:bg-black hover:text-white"
                  >
                    more info
                  </a>
                </>
              )}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
