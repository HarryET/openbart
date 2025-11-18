import { Hono } from "hono";
import { queueHandler } from "./queue";
import { PROVIDER_CONFIG } from "./providers";
import { tripUpdatesHandler } from "./handlers/trip-updates";
import { vehiclePositionsHandler } from "./handlers/vehicle-positions";
import { alertsHandler } from "./handlers/alerts";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/", (c) => {
  return c.json({
    message: "OpenBART GTFS RealTime API",
    endpoints: [
      "GET /:provider/trip-updates?at=<ISO8601>",
      "GET /:provider/vehicle-positions?at=<ISO8601>",
      "GET /:provider/alerts?at=<ISO8601>",
    ],
    providers: Object.keys(PROVIDER_CONFIG),
  });
});

app.get("/:provider/trip-updates", tripUpdatesHandler);
app.get("/:provider/vehicle-positions", vehiclePositionsHandler);
app.get("/:provider/alerts", alertsHandler);

export default {
  fetch: app.fetch,
  queue: queueHandler,
  async scheduled(event, env, ctx): Promise<void> {
    await env.SYNC_PROVIDER_QUEUE.sendBatch(
      Object.keys(PROVIDER_CONFIG).map((p) => ({ body: p })),
    );
  },
} satisfies ExportedHandler<CloudflareBindings, string>;
