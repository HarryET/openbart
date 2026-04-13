import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("status", "routes/status.tsx"),
  route("docs", "routes/docs.tsx"),
  route("s/:stationId", "routes/s.$stationId.tsx"),
] satisfies RouteConfig;
