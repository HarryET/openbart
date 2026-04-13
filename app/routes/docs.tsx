import type { Route } from "./+types/docs";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "openbart / docs" },
    {
      name: "description",
      content: "openbart REST API reference — endpoints, parameters, and rate limits",
    },
    { property: "og:title", content: "openbart / docs" },
    {
      property: "og:description",
      content: "openbart REST API reference — endpoints, parameters, and rate limits",
    },
    { property: "og:image", content: "/openbart-og.png" },
    { property: "og:type", content: "website" },
  ];
}

type Param = { name: string; type: string; description: string; required?: boolean };

type Endpoint = {
  method: "GET";
  path: string;
  summary: string;
  params?: Param[];
  query?: Param[];
  returns: string;
};

type Section = {
  id: string;
  title: string;
  blurb?: string;
  endpoints: Endpoint[];
};

const SECTIONS: Section[] = [
  {
    id: "stops",
    title: "stops",
    blurb: "stations and their platforms. each BART station is a parent stop with one or more platform children.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/stops",
        summary: "list all stops",
        query: [
          { name: "parent_only", type: "boolean", description: "only return parent stations (no platforms)" },
          { name: "offset", type: "integer", description: "pagination offset (default 0)" },
          { name: "limit", type: "integer", description: "page size (default 50, max 200)" },
        ],
        returns: "{ items: Stop[], pagination: { offset, limit, total } }",
      },
      {
        method: "GET",
        path: "/api/v1/stops/:id",
        summary: "single stop with its platforms (if parent) or parent station (if platform)",
        params: [{ name: "id", type: "string", description: "stop id (e.g. DBRK)", required: true }],
        returns: "Stop & { children: Stop[], parent: Stop | null }",
      },
      {
        method: "GET",
        path: "/api/v1/stops/:id/departures",
        summary: "next N departures from a stop, with real-time delays overlaid",
        params: [{ name: "id", type: "string", description: "stop id", required: true }],
        query: [
          { name: "limit", type: "integer", description: "number of upcoming departures (default 10, max 50)" },
          { name: "route_id", type: "string", description: "filter by route id" },
        ],
        returns: "{ stopId, date, departures: [{ tripId, routeId, headsign, directionId, stopSequence, arrivalTime, departureTime, realtime: { delay, uncertainty } | null }] }",
      },
      {
        method: "GET",
        path: "/api/v1/stops/:id/schedule",
        summary: "full scheduled day timetable for a stop",
        params: [{ name: "id", type: "string", description: "stop id", required: true }],
        query: [
          { name: "date", type: "string", description: "YYYYMMDD (defaults to today in America/Los_Angeles)" },
          { name: "route_id", type: "string", description: "filter by route id" },
        ],
        returns: "{ stopId, date, items: StopTime[] }",
      },
    ],
  },
  {
    id: "routes",
    title: "routes",
    blurb: "BART lines (Red, Blue, Yellow, Green, Orange, and others). each route has a color and direction.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/routes",
        summary: "list all routes",
        returns: "{ items: Route[], pagination }",
      },
      {
        method: "GET",
        path: "/api/v1/routes/:id",
        summary: "single route",
        params: [{ name: "id", type: "string", description: "route id", required: true }],
        returns: "Route",
      },
      {
        method: "GET",
        path: "/api/v1/routes/:id/trips",
        summary: "trips that run on this route",
        params: [{ name: "id", type: "string", description: "route id", required: true }],
        query: [
          { name: "direction_id", type: "0 | 1", description: "filter by direction" },
          { name: "offset", type: "integer", description: "pagination offset" },
          { name: "limit", type: "integer", description: "page size" },
        ],
        returns: "{ items: Trip[], pagination }",
      },
      {
        method: "GET",
        path: "/api/v1/routes/:id/stops",
        summary: "ordered list of stops along the route",
        params: [{ name: "id", type: "string", description: "route id", required: true }],
        query: [{ name: "direction_id", type: "0 | 1", description: "filter by direction" }],
        returns: "{ routeId, directionId, stops: [{ stopId, name, lat, lon, stopSequence }] }",
      },
    ],
  },
  {
    id: "trips",
    title: "trips",
    blurb: "a trip is a single train run — one vehicle going one direction on one route at a specific time.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/trips/:id",
        summary: "single trip with its route info",
        params: [{ name: "id", type: "string", description: "trip id", required: true }],
        returns: "Trip & { route: Route }",
      },
      {
        method: "GET",
        path: "/api/v1/trips/:id/stop-times",
        summary: "all scheduled stops for a trip, with real-time delays overlaid",
        params: [{ name: "id", type: "string", description: "trip id", required: true }],
        returns: "{ tripId, items: [StopTime & { realtime: { arrivalDelay, departureDelay, ... } | null }] }",
      },
    ],
  },
  {
    id: "realtime",
    title: "realtime",
    blurb: "live trip updates from BART's GTFS-RT feed. refreshed every minute.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/realtime/trip-updates",
        summary: "latest real-time snapshot for all trips",
        query: [
          { name: "route_id", type: "string", description: "filter by route id" },
          { name: "trip_id", type: "string", description: "filter by trip id" },
        ],
        returns: "{ items: TripUpdate[], pagination }",
      },
      {
        method: "GET",
        path: "/api/v1/realtime/trip-updates/:tripId",
        summary: "latest real-time update for a single trip, including per-stop delays",
        params: [{ name: "tripId", type: "string", description: "trip id", required: true }],
        returns: "TripUpdate & { stopTimeUpdates: StopTimeUpdate[] }",
      },
      {
        method: "GET",
        path: "/api/v1/realtime/stops/:stopId",
        summary: "latest real-time updates affecting a specific stop",
        params: [{ name: "stopId", type: "string", description: "stop id", required: true }],
        returns: "{ stopId, items: StopTimeUpdate[], pagination }",
      },
    ],
  },
  {
    id: "alerts",
    title: "alerts",
    blurb: "service disruptions, delays, and advisories published by BART.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/alerts",
        summary: "active alerts, optionally filtered by route or stop",
        query: [
          { name: "route_id", type: "string", description: "only alerts affecting this route" },
          { name: "stop_id", type: "string", description: "only alerts affecting this stop" },
          { name: "include_expired", type: "boolean", description: "also include deleted/expired alerts" },
          { name: "offset", type: "integer", description: "pagination offset" },
          { name: "limit", type: "integer", description: "page size" },
        ],
        returns: "{ items: (Alert & { informedEntities: InformedEntity[] })[], pagination }",
      },
      {
        method: "GET",
        path: "/api/v1/alerts/:id",
        summary: "single alert with informed entities and optional version history",
        params: [{ name: "id", type: "integer", description: "alert id", required: true }],
        query: [{ name: "include_history", type: "boolean", description: "include all past versions of this alert" }],
        returns: "Alert & { informedEntities, history?: AlertVersion[] }",
      },
    ],
  },
  {
    id: "status",
    title: "status",
    blurb: "rolled-up service health — current line status and 90-day on-time performance.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/status",
        summary: "overall system health and per-line status summary",
        returns: "{ overallStatus, generatedAt, lines: LineSummary[], activeAlertCount }",
      },
      {
        method: "GET",
        path: "/api/v1/status/lines",
        summary: "per-line status in a paginated envelope",
        returns: "{ items: LineSummary[], pagination }",
      },
      {
        method: "GET",
        path: "/api/v1/status/lines/:color/history",
        summary: "hourly history for one line",
        params: [{ name: "color", type: "string", description: "line color (e.g. RED, BLUE)", required: true }],
        query: [{ name: "days", type: "integer", description: "how many days back (1–90, default 90)" }],
        returns: "{ color, name, displayColor, days, hourly: HourlyPoint[], summary }",
      },
      {
        method: "GET",
        path: "/api/v1/status/alerts",
        summary: "current active alerts (with duration)",
        returns: "{ items: ActiveAlert[], pagination }",
      },
    ],
  },
  {
    id: "system",
    title: "system",
    blurb: "metadata about the transit agencies, the feed itself, and route geometry.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/agencies",
        summary: "list all transit agencies",
        returns: "{ items: Agency[], pagination }",
      },
      {
        method: "GET",
        path: "/api/v1/agencies/:id",
        summary: "single agency",
        params: [{ name: "id", type: "string", description: "agency id", required: true }],
        returns: "Agency",
      },
      {
        method: "GET",
        path: "/api/v1/feed-info",
        summary: "latest feed version and freshness info",
        returns: "FeedInfo",
      },
      {
        method: "GET",
        path: "/api/v1/shapes/:shapeId",
        summary: "GeoJSON LineString for a route shape (useful for drawing on a map)",
        params: [{ name: "shapeId", type: "string", description: "shape id", required: true }],
        returns: "{ shapeId, type: 'LineString', coordinates: [lon, lat][] }",
      },
    ],
  },
];

function EndpointBlock({ endpoint }: { endpoint: Endpoint }) {
  return (
    <div className="mb-6">
      <div className="mb-1">
        <span className="px-1 bg-black text-white">{endpoint.method}</span>{" "}
        <span>{endpoint.path}</span>
      </div>
      <div className="mb-2 pl-4">{endpoint.summary}</div>
      {endpoint.params && endpoint.params.length > 0 && (
        <div className="pl-4 mb-2">
          <div className="text-gray-600">path params:</div>
          {endpoint.params.map((p) => (
            <div key={p.name} className="pl-4">
              <span>{p.name}</span>{" "}
              <span className="text-gray-600">({p.type}{p.required ? ", required" : ""})</span>{" "}
              — {p.description}
            </div>
          ))}
        </div>
      )}
      {endpoint.query && endpoint.query.length > 0 && (
        <div className="pl-4 mb-2">
          <div className="text-gray-600">query params:</div>
          {endpoint.query.map((p) => (
            <div key={p.name} className="pl-4">
              <span>{p.name}</span>{" "}
              <span className="text-gray-600">({p.type})</span>{" "}
              — {p.description}
            </div>
          ))}
        </div>
      )}
      <div className="pl-4">
        <span className="text-gray-600">returns:</span> {endpoint.returns}
      </div>
    </div>
  );
}

export default function Docs() {
  return (
    <div className="font-mono min-h-screen flex flex-col">
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 text-sm">
        <h1 className="text-sm mb-8">openbart / docs</h1>

        <section className="mb-10">
          <h2 className="mb-2">overview</h2>
          <p className="mb-2">
            openbart is an open-source REST JSON API for Bay Area Rapid Transit (BART) data.
            it bundles the static schedule, real-time trip updates, service alerts, and rolled-up
            line health into a single simple API.
          </p>
          <p className="mb-2">
            all endpoints are <span className="px-1 bg-gray-100">GET</span>, return JSON, and are
            served from <span className="px-1 bg-gray-100">https://openbart.com</span>.
            the base path is <span className="px-1 bg-gray-100">/api/v1</span>.
          </p>
          <p>CORS is enabled for all origins, so you can call the API directly from a browser.</p>
        </section>

        <section className="mb-10">
          <h2 className="mb-2">authentication</h2>
          <p className="mb-2">
            the API is open and works with no authentication. if you want a higher rate limit,
            pass an API key on every request using one of:
          </p>
          <pre className="pl-4 mb-2 text-xs">
{`Authorization: Bearer <your-key>
X-API-Key: <your-key>`}
          </pre>
          <p>
            keys look like <span className="px-1 bg-gray-100">ob_sk_...</span>. see{" "}
            <a href="#limits" className="underline hover:bg-black hover:text-white">rate limits</a>{" "}
            below for how to request one.
          </p>
        </section>

        <section id="limits" className="mb-10">
          <h2 className="mb-2">rate limits</h2>
          <p className="mb-2">every response includes these headers so you can track usage:</p>
          <pre className="pl-4 mb-3 text-xs">
{`X-RateLimit-Limit:     <your limit per minute>
X-RateLimit-Remaining: <requests left in this window>
X-RateLimit-Reset:     <unix timestamp when the window resets>`}
          </pre>
          <div className="mb-3">
            <div>
              <span className="px-1 bg-gray-100">unauthenticated</span> — 60 requests per minute per IP
            </div>
            <div>
              <span className="px-1 bg-gray-100">authenticated</span> — 300 requests per minute per key (default; configurable per key)
            </div>
          </div>
          <p className="mb-2">
            when you exceed the limit you'll get a <span className="px-1 bg-gray-100">429</span>{" "}
            response with a <span className="px-1 bg-gray-100">Retry-After</span> header.
          </p>
          <p>
            need a higher limit, or want another transit agency indexed alongside BART?{" "}
            reach out to{" "}
            <a
              href="https://x.com/theharryet"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:bg-black hover:text-white"
            >
              @theharryet
            </a>{" "}
            on twitter.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-2">responses</h2>
          <p className="mb-2">single resources are returned directly as a JSON object:</p>
          <pre className="pl-4 mb-3 text-xs">
{`{ "id": "DBRK", "name": "Downtown Berkeley", ... }`}
          </pre>
          <p className="mb-2">list endpoints use a consistent pagination envelope:</p>
          <pre className="pl-4 mb-3 text-xs">
{`{
  "items": [...],
  "pagination": { "offset": 0, "limit": 50, "total": 234 }
}`}
          </pre>
          <p className="mb-2">
            pagination params: <span className="px-1 bg-gray-100">?offset=0&limit=50</span>{" "}
            (default 50, max 200).
          </p>
          <p className="mb-2">errors return a standard shape with a matching HTTP status:</p>
          <pre className="pl-4 mb-3 text-xs">
{`{ "error": { "code": "NOT_FOUND", "message": "Stop 'FAKE' not found" } }`}
          </pre>
          <div>
            <div>200 — success</div>
            <div>400 — bad request (invalid params)</div>
            <div>401 — invalid or disabled API key</div>
            <div>404 — resource not found</div>
            <div>429 — rate limited</div>
            <div>500 — internal server error</div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4">endpoints</h2>
          <nav className="mb-6 flex flex-wrap gap-x-3 gap-y-1">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="underline hover:bg-black hover:text-white"
              >
                {s.title}
              </a>
            ))}
          </nav>

          {SECTIONS.map((section) => (
            <div key={section.id} id={section.id} className="mb-10">
              <h3 className="mb-1">/{section.title}</h3>
              {section.blurb && <p className="mb-4 text-gray-600">{section.blurb}</p>}
              {section.endpoints.map((e) => (
                <EndpointBlock key={`${e.method} ${e.path}`} endpoint={e} />
              ))}
            </div>
          ))}
        </section>
      </main>

      <footer className="w-full px-4 py-4 flex items-center justify-between font-mono text-sm shrink-0 border-t">
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
            href="/"
            className="hover:cursor-pointer hover:bg-black hover:text-white"
          >
            home
          </a>
          <a
            href="/status"
            className="hover:cursor-pointer hover:bg-black hover:text-white"
          >
            status
          </a>
        </div>
      </footer>
    </div>
  );
}
