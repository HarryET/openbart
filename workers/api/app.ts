import { Hono } from "hono";
import type { ApiKeyRow } from "../../db/schema";
import { auth } from "./middleware/auth";
import { cors } from "./middleware/cors";
import { rateLimit } from "./middleware/rate-limit";
import { alertRoutes } from "./routes/alerts";
import { realtimeRoutes } from "./routes/realtime";
import { routeRoutes } from "./routes/routes";
import { statusRoutes } from "./routes/status";
import { stopRoutes } from "./routes/stops";
import { systemRoutes } from "./routes/system";
import { tripRoutes } from "./routes/trips";
import { errorResponse } from "./lib/response";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    apiKey?: ApiKeyRow;
    rateLimit?: { limit: number; remaining: number; reset: number };
  };
};

export const api = new Hono<AppEnv>().basePath("/api/v1");

api.use("*", cors());
api.use("*", auth());
api.use("*", rateLimit());

api.route("/stops", stopRoutes);
api.route("/routes", routeRoutes);
api.route("/trips", tripRoutes);
api.route("/realtime", realtimeRoutes);
api.route("/alerts", alertRoutes);
api.route("/", systemRoutes);
api.route("/", statusRoutes);

api.notFound((c) => errorResponse(c, "NOT_FOUND", `Route ${c.req.method} ${c.req.path} not found`));

api.onError((err, c) => {
  console.error("API error:", err);
  return errorResponse(c, "INTERNAL_ERROR", "An internal error occurred");
});
