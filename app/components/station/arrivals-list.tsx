import { NextArrivalRow, type Arrival } from "./next-arrival-row";

type PlatformGroup = {
  platformCode: string | null;
  headsigns: string[];
  arrivals: Arrival[];
};

type DirectionGroup = {
  directionId: number | null;
  label: string;
  platforms: PlatformGroup[];
};

function directionLabel(directionId: number | null): string {
  if (directionId === 0) return "Northbound";
  if (directionId === 1) return "Southbound";
  return "Other";
}

// Sort platform codes naturally (1, 2, 3, 10 rather than 1, 10, 2, 3).
function comparePlatforms(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

function groupByDirectionAndPlatform(arrivals: Arrival[]): DirectionGroup[] {
  const byDir = new Map<number | null, Map<string | null, Arrival[]>>();
  for (const a of arrivals) {
    const dirMap = byDir.get(a.directionId) ?? new Map<string | null, Arrival[]>();
    const list = dirMap.get(a.platformCode) ?? [];
    list.push(a);
    dirMap.set(a.platformCode, list);
    byDir.set(a.directionId, dirMap);
  }

  const directions: DirectionGroup[] = [];
  // Stable direction order: 0 first (north), then 1 (south), then nulls.
  const dirKeys = Array.from(byDir.keys()).sort((x, y) => {
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return x - y;
  });

  for (const dirId of dirKeys) {
    const dirMap = byDir.get(dirId)!;
    const platKeys = Array.from(dirMap.keys()).sort(comparePlatforms);
    const platforms: PlatformGroup[] = platKeys.map((pk) => {
      const list = dirMap.get(pk)!;
      const headsigns = Array.from(
        new Set(list.map((a) => a.headsign).filter((h): h is string => !!h)),
      );
      return { platformCode: pk, headsigns, arrivals: list };
    });
    directions.push({
      directionId: dirId,
      label: directionLabel(dirId),
      platforms,
    });
  }

  return directions;
}

type Props = {
  arrivals: Arrival[];
  loading?: boolean;
  tickMs: number;
};

export function ArrivalsList({ arrivals, loading, tickMs }: Props) {
  if (loading) {
    return (
      <div className="text-sm text-gray-500 py-4">Loading arrivals…</div>
    );
  }

  if (arrivals.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4">
        No upcoming arrivals scheduled.
      </div>
    );
  }

  const directions = groupByDirectionAndPlatform(arrivals);
  // Collapse platform header when there's exactly one platform in the direction
  // (it would just duplicate the direction label).
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {directions.map((dir) => (
        <section key={String(dir.directionId)}>
          <h3 className="text-sm font-bold mb-2 uppercase tracking-wide">
            {dir.label}
          </h3>
          <div className="space-y-4">
            {dir.platforms.map((plat) => (
              <div key={plat.platformCode ?? "none"}>
                {dir.platforms.length > 1 && (
                  <div className="text-xs text-gray-600 mb-1">
                    Platform {plat.platformCode ?? "?"}
                    {plat.headsigns.length > 0 && (
                      <span className="text-gray-400">
                        {" — "}
                        {plat.headsigns.join(" / ")}
                      </span>
                    )}
                  </div>
                )}
                <div className="border border-gray-200 rounded">
                  {plat.arrivals.map((a) => (
                    <div key={`${a.tripId}-${a.stopId}`} className="px-3">
                      <NextArrivalRow arrival={a} tickMs={tickMs} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
