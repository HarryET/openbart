import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { errorResponse } from "../lib/response";
import type { AppEnv } from "../app";

const ANON_LIMIT = 60;
const WINDOW_SECONDS = 60;
const KV_TTL_SECONDS = 120;

function windowStart(nowMs: number): number {
  return Math.floor(nowMs / (WINDOW_SECONDS * 1000));
}

function clientIp(c: Context<AppEnv>): string {
  return (
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export const rateLimit = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const apiKey = c.get("apiKey");
    const window = windowStart(Date.now());
    const resetUnix = (window + 1) * WINDOW_SECONDS;

    let bucketKey: string;
    let limit: number;

    if (apiKey) {
      bucketKey = `rl:key:${apiKey.keyHash.slice(0, 16)}:${window}`;
      limit = apiKey.rateLimitPerMinute;
    } else {
      bucketKey = `rl:ip:${clientIp(c)}:${window}`;
      limit = ANON_LIMIT;
    }

    const kv = c.env.KV;
    const currentRaw = await kv.get(bucketKey);
    const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;

    if (current >= limit) {
      const retryAfter = Math.max(1, resetUnix - Math.floor(Date.now() / 1000));
      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(limit));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(resetUnix));
      return errorResponse(c, "RATE_LIMITED", "Rate limit exceeded");
    }

    const next_count = current + 1;
    // Fire-and-forget write; use waitUntil so the response is not delayed.
    c.executionCtx.waitUntil(
      kv.put(bucketKey, String(next_count), { expirationTtl: KV_TTL_SECONDS }),
    );

    c.set("rateLimit", { limit, remaining: Math.max(0, limit - next_count), reset: resetUnix });

    await next();

    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(Math.max(0, limit - next_count)));
    c.header("X-RateLimit-Reset", String(resetUnix));
  });
