import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { Route } from "./+types/s.$stationId";
import { StationHeader } from "../components/station/station-header";
import {
  ArrivalsList,
} from "../components/station/arrivals-list";
import type { Arrival } from "../components/station/next-arrival-row";
import {
  StationHistoryCard,
  type StationHistory,
} from "../components/station/station-history-card";
import {
  ActiveAlerts,
  type ActiveAlert,
} from "../components/status/active-alerts";

export function meta({ params }: Route.MetaArgs) {
  const id = params.stationId ?? "";
  return [
    { title: `openbart / ${id}` },
    {
      name: "description",
      content: `Upcoming BART arrivals and on-time history for ${id}`,
    },
    { property: "og:title", content: `openbart / ${id}` },
    {
      property: "og:description",
      content: `Upcoming BART arrivals and on-time history for ${id}`,
    },
    { property: "og:image", content: "/openbart-og.png" },
    { property: "og:type", content: "website" },
  ];
}

type StopResponse = {
  id: string;
  name: string;
  locationType: number | null;
  parentStation: string | null;
  platformCode: string | null;
  children: Array<{
    id: string;
    name: string;
    platformCode: string | null;
    locationType: number | null;
  }>;
  parent: { id: string; name: string } | null;
};

type ArrivalsResponse = {
  stopId: string;
  date: string;
  arrivals: Arrival[];
};

type HistoryResponse = StationHistory;

type AlertsApiResponse = {
  items: Array<{
    id: number;
    headerText: string | null;
    descriptionText: string | null;
    url: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 404) {
    const err = new Error(`${url} → 404`);
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

// Tick every 15s so arrival countdowns re-render, without re-fetching data.
function useTick(intervalMs = 15_000) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}

// Convert /alerts?stop_id=... items into the shape ActiveAlerts expects.
function toActiveAlerts(rows: AlertsApiResponse["items"]): ActiveAlert[] {
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    headerText: r.headerText,
    descriptionText: r.descriptionText,
    url: r.url,
    createdAt: r.createdAt,
    durationMinutes: Math.max(
      0,
      Math.floor((now - new Date(r.createdAt).getTime()) / 60_000),
    ),
  }));
}

export default function StationPage() {
  const params = useParams<{ stationId: string }>();
  const stationId = (params.stationId ?? "").toUpperCase();
  const tickMs = useTick();

  const stopQ = useQuery({
    queryKey: ["station", "stop", stationId],
    queryFn: () => fetchJson<StopResponse>(`/api/v1/stops/${stationId}`),
    enabled: !!stationId,
    retry: (count, err) => {
      const status = (err as Error & { status?: number }).status;
      if (status === 404) return false;
      return count < 1;
    },
  });

  const notFound =
    stopQ.isError &&
    (stopQ.error as Error & { status?: number }).status === 404;

  const dependentQueries = useQueries({
    queries: [
      {
        queryKey: ["station", "arrivals", stationId],
        queryFn: () =>
          fetchJson<ArrivalsResponse>(
            `/api/v1/stops/${stationId}/arrivals?limit=20`,
          ),
        enabled: !!stationId && !notFound,
        // Arrivals are cached 30s server-side; pull more often to feel live.
        staleTime: 30_000,
        refetchInterval: 30_000,
      },
      {
        queryKey: ["station", "history", stationId],
        queryFn: () =>
          fetchJson<HistoryResponse>(
            `/api/v1/stops/${stationId}/history?days=7`,
          ),
        enabled: !!stationId && !notFound,
        staleTime: 5 * 60_000,
      },
      {
        queryKey: ["station", "alerts", stationId],
        queryFn: () =>
          fetchJson<AlertsApiResponse>(
            `/api/v1/alerts?stop_id=${stationId}`,
          ),
        enabled: !!stationId && !notFound,
        staleTime: 60_000,
      },
    ] as const,
  });

  const arrivalsQ = dependentQueries[0];
  const historyQ = dependentQueries[1];
  const alertsQ = dependentQueries[2];

  const arrivalsData = arrivalsQ.data as ArrivalsResponse | undefined;
  const historyData = historyQ.data as HistoryResponse | undefined;
  const alertsData = alertsQ.data as AlertsApiResponse | undefined;

  return (
    <div className="font-mono min-h-screen flex flex-col">
      <StationHeader
        stationId={stationId}
        name={stopQ.data?.name}
        loading={stopQ.isLoading}
      />

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 pb-8 mt-4">
        {notFound ? (
          <div className="border border-gray-300 rounded p-6 text-center mt-8">
            <p className="text-sm">
              Station <span className="font-bold">{stationId}</span> not found.
            </p>
            <p className="text-xs text-gray-500 mt-2">
              <Link
                to="/"
                className="underline hover:bg-black hover:text-white"
              >
                Back to the map
              </Link>
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <StationHistoryCard
                history={historyData}
                loading={historyQ.isLoading}
                error={historyQ.isError}
              />
            </div>

            {alertsData && alertsData.items.length > 0 && (
              <ActiveAlerts alerts={toActiveAlerts(alertsData.items)} />
            )}

            <section className="mt-8">
              <h2 className="text-sm font-bold mb-4 uppercase tracking-wide">
                Next arrivals
              </h2>
              <ArrivalsList
                arrivals={arrivalsData?.arrivals ?? []}
                loading={arrivalsQ.isLoading}
                tickMs={tickMs}
              />
            </section>
          </>
        )}
      </main>

      <footer className="w-full px-4 py-4 flex items-center justify-between font-mono text-sm shrink-0">
        <span>
          a project by{" "}
          <a
            href="https://harrybairstow.com?utm_source=openbart"
            className="hover:cursor-pointer hover:bg-black hover:text-white"
            target="_blank"
            rel="noopener noreferrer"
          >
            harry
          </a>
        </span>
        <div className="flex gap-2">
          <a
            href="/status"
            className="hover:cursor-pointer hover:bg-black hover:text-white"
          >
            status
          </a>
          <a
            href="/docs"
            className="hover:cursor-pointer hover:bg-black hover:text-white"
          >
            docs
          </a>
        </div>
      </footer>
    </div>
  );
}
