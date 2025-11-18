import { Hono } from "hono";
import { serveStatic } from "hono/cloudflare-workers";
import { queueHandler } from "./queue";
import { PROVIDER_CONFIG } from "./providers";
import { tripUpdatesHandler } from "./handlers/trip-updates";
import { vehiclePositionsHandler } from "./handlers/vehicle-positions";
import { alertsHandler } from "./handlers/alerts";
import { departuresHandler } from "./handlers/departures";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/", (c) => {
  return c.json({
    message: "OpenBART GTFS RealTime API",
    endpoints: [
      "GET /:provider/trip-updates?at=<ISO8601>",
      "GET /:provider/vehicle-positions?at=<ISO8601>",
      "GET /:provider/alerts?at=<ISO8601>",
      "GET /:provider/departures/:station/:platform?at=<ISO8601>",
      "GET /display/:station - Dot matrix display view",
    ],
    providers: Object.keys(PROVIDER_CONFIG),
  });
});

// Dot matrix display page
app.get("/display/:station", serveStatic({ path: "./display.html" }));

// API endpoints
app.get("/:provider/trip-updates", tripUpdatesHandler);
app.get("/:provider/vehicle-positions", vehiclePositionsHandler);
app.get("/:provider/alerts", alertsHandler);
app.get("/:provider/departures/:station/:platform", departuresHandler);
app.get("/:provider/departures/:station", departuresHandler);

export default {
  fetch: app.fetch,
  queue: queueHandler,
  async scheduled(event, env, ctx): Promise<void> {
    // Fetch all feeds and queue the raw data for processing
    const messages = [];

    for (const [providerId, config] of Object.entries(PROVIDER_CONFIG)) {
      const urls = [
        { url: config.tripupdates_url, type: "trip_updates" },
        { url: config.alerts_url, type: "alerts" },
      ];

      for (const { url, type } of urls) {
        try {
          const response = await fetch(url, { headers: config.headers });
          if (!response.ok) {
            console.error(`Failed to fetch ${type} for ${providerId}: ${response.status}`);
            continue;
          }

          const buffer = await response.arrayBuffer();

          messages.push({
            body: JSON.stringify({
              providerId,
              type,
              rawFeed: Array.from(new Uint8Array(buffer)),
              fetchedAt: Date.now(),
            }),
          });
        } catch (error) {
          console.error(`Error fetching ${type} for ${providerId}:`, error);
        }
      }
    }

    if (messages.length > 0) {
      await env.SYNC_PROVIDER_QUEUE.sendBatch(messages);
    }
  },
} satisfies ExportedHandler<CloudflareBindings, string>;
