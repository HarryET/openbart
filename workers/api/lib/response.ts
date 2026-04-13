import type { Context } from "hono";

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, 400 | 401 | 404 | 429 | 500> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export function errorResponse(c: Context, code: ErrorCode, message: string) {
  return c.json({ error: { code, message } }, STATUS_BY_CODE[code]);
}

export type Pagination = { offset: number; limit: number; total: number };

export function paginated<T>(items: T[], pagination: Pagination) {
  return { items, pagination };
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export function parsePagination(query: URLSearchParams) {
  const rawOffset = Number(query.get("offset") ?? "0");
  const rawLimit = Number(query.get("limit") ?? String(DEFAULT_LIMIT));
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_LIMIT;
  return { offset, limit };
}
