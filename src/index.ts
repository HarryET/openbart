import { Hono } from "hono";
import { queueHandler } from "./queue";
import { PROVIDER_CONFIG } from "./providers";
import { tripUpdatesHandler } from "./handlers/trip-updates";
import { vehiclePositionsHandler } from "./handlers/vehicle-positions";
import { alertsHandler } from "./handlers/alerts";
import { departuresHandler } from "./handlers/departures";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/", async (c) => {
  return c.env.ASSETS.fetch(new Request("https://placeholder/index.html"));
});

// Dot matrix display page
app.get("/display/:station", async (c) => {
  return c.env.ASSETS.fetch(new Request("https://placeholder/display.html"));
});

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
