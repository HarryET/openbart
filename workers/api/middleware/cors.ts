import { cors as honoCors } from "hono/cors";

export const cors = () =>
  honoCors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Authorization", "X-API-Key", "Content-Type"],
    exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Retry-After"],
    maxAge: 86400,
  });
