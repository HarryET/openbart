import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { createDb } from "../../../db/client";
import { apiKeys, type ApiKeyRow } from "../../../db/schema";
import { errorResponse } from "../lib/response";
import type { AppEnv } from "../app";

const KEY_PREFIX = "ob_sk_";

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractKey(authHeader: string | null, xApiKey: string | null): string | null {
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }
  if (xApiKey) return xApiKey.trim();
  return null;
}

export const auth = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const rawKey = extractKey(
      c.req.header("Authorization") ?? null,
      c.req.header("X-API-Key") ?? null,
    );

    if (!rawKey) {
      // Unauthenticated — downstream rate-limit middleware will apply the IP tier.
      return next();
    }

    if (!rawKey.startsWith(KEY_PREFIX)) {
      return errorResponse(c, "UNAUTHORIZED", "Invalid API key format");
    }

    const keyHash = await sha256Hex(rawKey);
    const db = createDb(c.env);
    const [row] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);

    if (!row || row.isActive !== 1) {
      return errorResponse(c, "UNAUTHORIZED", "Invalid or disabled API key");
    }

    c.set("apiKey", row satisfies ApiKeyRow);
    return next();
  });
