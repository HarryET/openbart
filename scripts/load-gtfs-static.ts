#!/usr/bin/env tsx
/**
 * Load BART GTFS Static Data
 * Downloads and imports BART's static GTFS schedule data into the database
 *
 * Usage: npx tsx scripts/load-gtfs-static.ts
 */

import { drizzle } from "drizzle-orm/d1";
import { routes, stops, trips, stopTimes, calendar } from "../src/schema";
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";

const GTFS_URL = "https://www.bart.gov/dev/schedules/google_transit.zip";
const PROVIDER_ID = "bart";

async function downloadAndExtract() {
  console.log("Downloading BART GTFS data...");

  const response = await fetch(GTFS_URL);
  const buffer = await response.arrayBuffer();

  const tmpDir = "/tmp/bart_gtfs";
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const zipPath = path.join(tmpDir, "google_transit.zip");
  fs.writeFileSync(zipPath, Buffer.from(buffer));

  console.log("Extracting...");
  const { execSync } = require("child_process");
  execSync(`unzip -o ${zipPath} -d ${tmpDir}`);

  return tmpDir;
}

function parseCSV(filePath: string): any[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
  });
}

async function loadRoutes(db: any, dataDir: string) {
  console.log("Loading routes...");
  const routesData = parseCSV(path.join(dataDir, "routes.txt"));

  for (const row of routesData) {
    await db
      .insert(routes)
      .values({
        providerId: PROVIDER_ID,
        routeId: row.route_id,
        routeShortName: row.route_short_name || null,
        routeLongName: row.route_long_name || null,
        routeType: parseInt(row.route_type),
        routeColor: row.route_color || null,
        routeTextColor: row.route_text_color || null,
        routeUrl: row.route_url || null,
      })
      .onConflictDoNothing();
  }

  console.log(`Loaded ${routesData.length} routes`);
}

async function loadStops(db: any, dataDir: string) {
  console.log("Loading stops...");
  const stopsData = parseCSV(path.join(dataDir, "stops.txt"));

  for (const row of stopsData) {
    await db
      .insert(stops)
      .values({
        providerId: PROVIDER_ID,
        stopId: row.stop_id,
        stopCode: row.stop_code || null,
        stopName: row.stop_name,
        stopLat: row.stop_lat || null,
        stopLon: row.stop_lon || null,
        zoneId: row.zone_id || null,
        parentStation: row.parent_station || null,
        platformCode: row.platform_code || null,
      })
      .onConflictDoNothing();
  }

  console.log(`Loaded ${stopsData.length} stops`);
}

async function loadTrips(db: any, dataDir: string) {
  console.log("Loading trips...");
  const tripsData = parseCSV(path.join(dataDir, "trips.txt"));

  let count = 0;
  for (const row of tripsData) {
    await db
      .insert(trips)
      .values({
        providerId: PROVIDER_ID,
        tripId: row.trip_id,
        routeId: row.route_id,
        serviceId: row.service_id,
        tripHeadsign: row.trip_headsign || null,
        directionId: row.direction_id ? parseInt(row.direction_id) : null,
        blockId: row.block_id || null,
        shapeId: row.shape_id || null,
      })
      .onConflictDoNothing();

    count++;
    if (count % 1000 === 0) {
      console.log(`  ${count} trips loaded...`);
    }
  }

  console.log(`Loaded ${tripsData.length} trips`);
}

async function loadStopTimes(db: any, dataDir: string) {
  console.log("Loading stop times (this may take a while)...");
  const stopTimesData = parseCSV(path.join(dataDir, "stop_times.txt"));

  let count = 0;
  for (const row of stopTimesData) {
    await db.insert(stopTimes).values({
      providerId: PROVIDER_ID,
      tripId: row.trip_id,
      stopId: row.stop_id,
      stopSequence: parseInt(row.stop_sequence),
      arrivalTime: row.arrival_time || null,
      departureTime: row.departure_time || null,
      stopHeadsign: row.stop_headsign || null,
    });

    count++;
    if (count % 5000 === 0) {
      console.log(`  ${count} stop times loaded...`);
    }
  }

  console.log(`Loaded ${stopTimesData.length} stop times`);
}

async function loadCalendar(db: any, dataDir: string) {
  console.log("Loading calendar...");
  const calendarData = parseCSV(path.join(dataDir, "calendar.txt"));

  for (const row of calendarData) {
    await db
      .insert(calendar)
      .values({
        providerId: PROVIDER_ID,
        serviceId: row.service_id,
        monday: parseInt(row.monday),
        tuesday: parseInt(row.tuesday),
        wednesday: parseInt(row.wednesday),
        thursday: parseInt(row.thursday),
        friday: parseInt(row.friday),
        saturday: parseInt(row.saturday),
        sunday: parseInt(row.sunday),
        startDate: row.start_date,
        endDate: row.end_date,
      })
      .onConflictDoNothing();
  }

  console.log(`Loaded ${calendarData.length} calendar entries`);
}

async function main() {
  // This script is for local use - you'll need to adapt it for Cloudflare D1
  console.log("⚠️  This script needs to be adapted for your database setup");
  console.log("For Cloudflare Workers, you'll need to:");
  console.log("1. Run this locally with a local D1 database");
  console.log("2. Use wrangler d1 execute to run the SQL");
  console.log("3. Or manually insert the data via the API");

  const dataDir = await downloadAndExtract();

  console.log("\n✅ GTFS data downloaded to:", dataDir);
  console.log("\nYou can now:");
  console.log("1. Use the CSV files to bulk import via SQL");
  console.log("2. Or adapt this script to work with D1");

  // Uncomment and adapt this for your database setup:
  // const db = drizzle(...your connection...);
  // await loadRoutes(db, dataDir);
  // await loadStops(db, dataDir);
  // await loadTrips(db, dataDir);
  // await loadStopTimes(db, dataDir);
  // await loadCalendar(db, dataDir);
}

main().catch(console.error);
