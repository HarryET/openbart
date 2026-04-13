import { createDb } from "../db/client";
import { fetchAlertFeed } from "./alerts/fetch";
import { syncAlerts } from "./alerts/sync";
import { fetchTripUpdateFeed } from "./trip-updates/fetch";
import { syncTripUpdates } from "./trip-updates/sync";
import { syncStaticGtfs } from "./gtfs-static/sync";
import { syncHourlyRollup } from "./rollup/sync";

export const syncDataCron = async (env: Env, _ctx: ExecutionContext) => {
  const db = createDb(env);

  const [feedAlerts, feedTripUpdates] = await Promise.all([
    fetchAlertFeed(),
    fetchTripUpdateFeed(),
  ]);

  await syncAlerts(db, feedAlerts);
  await syncTripUpdates(db, feedTripUpdates);
  await syncHourlyRollup(db);
};

export const syncStaticGtfsCron = async (
  env: Env,
  _ctx: ExecutionContext,
) => {
  const db = createDb(env);
  await syncStaticGtfs(db);
};
