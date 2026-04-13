import type GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type { ActivePeriod, InformedEntitySnapshot } from "../../db/schema";
import type { FeedAlert } from "./fetch";

export type AlertContent = {
  headerText: string | null;
  descriptionText: string | null;
  url: string | null;
  cause: number | null;
  effect: number | null;
  severityLevel: number | null;
  activePeriods: ActivePeriod[] | null;
};

export function extractAlertContent(alert: FeedAlert): AlertContent {
  return {
    headerText: extractTranslation(alert.headerText),
    descriptionText: extractTranslation(alert.descriptionText),
    url: extractTranslation(alert.url),
    cause: alert.cause ?? null,
    effect: alert.effect ?? null,
    severityLevel: alert.severityLevel ?? null,
    activePeriods:
      alert.activePeriod?.map((p) => ({
        start: p.start ? Number(p.start) : undefined,
        end: p.end ? Number(p.end) : undefined,
      })) ?? null,
  };
}

export function extractTranslation(
  ts:
    | GtfsRealtimeBindings.transit_realtime.ITranslatedString
    | null
    | undefined,
): string | null {
  if (!ts?.translation?.length) return null;
  const en = ts.translation.find(
    (t) => t.language === "en" || t.language === "en-US",
  );
  return en?.text ?? ts.translation[0].text ?? null;
}

export function extractInformedEntities(
  alert: FeedAlert,
): InformedEntitySnapshot[] {
  return (
    alert.informedEntity?.map((e) => ({
      agencyId: e.agencyId || null,
      routeId: e.routeId || null,
      stopId: e.stopId || null,
      directionId: e.directionId ?? null,
      routeType: e.routeType ?? null,
      tripId: e.trip?.tripId || null,
    })) ?? []
  );
}

export function hasContentChanged(
  dbAlert: {
    headerText: string | null;
    descriptionText: string | null;
    url: string | null;
    cause: number | null;
    effect: number | null;
    severityLevel: number | null;
    activePeriods: ActivePeriod[] | null;
  },
  content: AlertContent,
): boolean {
  return (
    dbAlert.headerText !== content.headerText ||
    dbAlert.descriptionText !== content.descriptionText ||
    dbAlert.url !== content.url ||
    dbAlert.cause !== content.cause ||
    dbAlert.effect !== content.effect ||
    dbAlert.severityLevel !== content.severityLevel ||
    JSON.stringify(dbAlert.activePeriods) !==
      JSON.stringify(content.activePeriods)
  );
}

export function hasInformedEntitiesChanged(
  dbEntities: InformedEntitySnapshot[],
  feedEntities: InformedEntitySnapshot[],
): boolean {
  return JSON.stringify(dbEntities) !== JSON.stringify(feedEntities);
}
