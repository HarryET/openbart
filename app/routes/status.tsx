import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import type { Route } from "./+types/status";
import {
  OverallStatus,
  type OverallStatusLevel,
} from "../components/status/overall-status";
import {
  ActiveAlerts,
  type ActiveAlert,
} from "../components/status/active-alerts";
import {
  LineStatusRow,
  type LineSummary,
} from "../components/status/line-status-row";
import type { HourlyPoint } from "../components/status/uptime-bar";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "openbart / status" },
    {
      name: "description",
      content: "BART system status — live health and 90-day uptime per line",
    },
    { property: "og:title", content: "openbart / status" },
    {
      property: "og:description",
      content: "BART system status — live health and 90-day uptime per line",
    },
    { property: "og:image", content: "/openbart-og.png" },
    { property: "og:type", content: "website" },
  ];
}

type StatusSummary = {
  overallStatus: OverallStatusLevel;
  generatedAt: string;
  lines: LineSummary[];
  activeAlertCount: number;
};

type HistoryResponse = {
  color: string;
  name: string;
  days: number;
  hourly: HourlyPoint[];
  summary: {
    onTimePct: number | null;
    avgDelaySec: number | null;
  };
};

type AlertsResponse = {
  items: ActiveAlert[];
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

export default function StatusPage() {
  const summary = useQuery({
    queryKey: ["status", "summary"],
    queryFn: () => fetchJson<StatusSummary>("/api/v1/status"),
  });

  const alerts = useQuery({
    queryKey: ["status", "alerts"],
    queryFn: () => fetchJson<AlertsResponse>("/api/v1/status/alerts"),
  });

  const lines = summary.data?.lines ?? [];

  const histories = useQueries({
    queries: lines.map((line) => ({
      queryKey: ["status", "history", line.color] as const,
      queryFn: () =>
        fetchJson<HistoryResponse>(
          `/api/v1/status/lines/${line.color}/history?days=90`,
        ),
      enabled: !!summary.data,
    })),
  });

  const overall: OverallStatusLevel = summary.isLoading
    ? "loading"
    : (summary.data?.overallStatus ?? "no_data");

  return (
    <div className="font-mono min-h-screen flex flex-col">
      <header className="px-4 pt-4">
        <h1 className="text-sm mb-4">
          <Link
            to="/"
            className="hover:cursor-pointer hover:bg-black hover:text-white"
          >
            openbart
          </Link>
          {" / status"}
        </h1>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pb-8">
        <OverallStatus
          status={overall}
          generatedAt={summary.data?.generatedAt}
          error={summary.isError}
        />

        <p className="text-xs text-gray-500 mt-4 text-right">
          Uptime over the past 90 days.
        </p>

        {alerts.data && <ActiveAlerts alerts={alerts.data.items} />}

        <div className="mt-8 space-y-8">
          {summary.isLoading &&
            // Render 5 placeholder rows so the layout doesn't flash empty.
            Array.from({ length: 5 }).map((_, i) => (
              <LineStatusRow
                key={`skeleton-${i}`}
                line={{
                  color: "",
                  name: "…",
                  displayColor: "#e5e7eb",
                  status: "no_data",
                  avgDelaySec: 0,
                  onTimePct: 0,
                  onTimePct90d: null,
                  avgDelaySec90d: null,
                }}
                loadingHistory
              />
            ))}

          {!summary.isLoading &&
            lines.map((line, idx) => {
              const history = histories[idx];
              return (
                <LineStatusRow
                  key={line.color}
                  line={line}
                  hourly={history?.data?.hourly}
                  loadingHistory={history?.isLoading}
                />
              );
            })}

          {summary.isError && (
            <p className="text-sm text-red-600">
              Failed to load status. Try refreshing the page.
            </p>
          )}
        </div>
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
            href="/home"
            className="hover:cursor-pointer hover:bg-black hover:text-white"
          >
            home
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
