#!/usr/bin/env node
/**
 * Generate SQL migrations from BART GTFS static data
 * This downloads the GTFS zip and creates migration files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GTFS_URL = 'https://www.bart.gov/dev/schedules/google_transit.zip';
const TMP_DIR = '/tmp/bart_gtfs_migrations';
const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');
const PROVIDER_ID = 'bart';

// SQL escape helper - FIXED to handle empty strings properly
function sqlEscape(str) {
  if (str === null || str === undefined) return 'NULL';
  if (str === '') return 'NULL'; // Empty string to NULL
  // Remove quotes from the string first
  const cleaned = String(str).replace(/^["']|["']$/g, '').trim();
  if (cleaned === '') return 'NULL';
  return "'" + cleaned.replace(/'/g, "''") + "'";
}

function downloadAndExtract() {
  console.log('Downloading BART GTFS data...');

  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }

  const zipPath = path.join(TMP_DIR, 'google_transit.zip');
  execSync(`curl -sL "${GTFS_URL}" -o "${zipPath}"`);
  execSync(`unzip -o -q "${zipPath}" -d "${TMP_DIR}"`);

  console.log('✓ Downloaded and extracted GTFS data');
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/\r/g, '').replace(/^["']|["']$/g, ''));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/\r/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/\r/g, ''));

    const row = {};
    headers.forEach((header, idx) => {
      const val = values[idx] || '';
      row[header] = val;
    });
    rows.push(row);
  }

  return rows;
}

function generateRoutesMigration() {
  console.log('Generating routes migration...');
  const routes = parseCSV(path.join(TMP_DIR, 'routes.txt'));

  let sql = `-- BART Routes\n`;
  sql += `INSERT INTO routes (provider_id, route_id, route_short_name, route_long_name, route_type, route_color, route_text_color, route_url) VALUES\n`;

  const values = routes.map(r =>
    `(${sqlEscape(PROVIDER_ID)}, ${sqlEscape(r.route_id)}, ${sqlEscape(r.route_short_name)}, ${sqlEscape(r.route_long_name)}, ${sqlEscape(r.route_type)}, ${sqlEscape(r.route_color)}, ${sqlEscape(r.route_text_color)}, ${sqlEscape(r.route_url)})`
  );

  sql += values.join(',\n');
  sql += '\nON CONFLICT DO NOTHING;\n';

  fs.writeFileSync(path.join(MIGRATIONS_DIR, '0003_bart_routes.sql'), sql);
  console.log(`✓ Generated routes migration (${routes.length} routes)`);
}

function generateStopsMigration() {
  console.log('Generating stops migration...');
  const stops = parseCSV(path.join(TMP_DIR, 'stops.txt'));

  let sql = `-- BART Stops\n`;
  sql += `INSERT INTO stops (provider_id, stop_id, stop_code, stop_name, stop_lat, stop_lon, zone_id, parent_station, platform_code) VALUES\n`;

  const values = stops.map(s =>
    `(${sqlEscape(PROVIDER_ID)}, ${sqlEscape(s.stop_id)}, ${sqlEscape(s.stop_code)}, ${sqlEscape(s.stop_name)}, ${sqlEscape(s.stop_lat)}, ${sqlEscape(s.stop_lon)}, ${sqlEscape(s.zone_id)}, ${sqlEscape(s.parent_station)}, ${sqlEscape(s.platform_code)})`
  );

  sql += values.join(',\n');
  sql += '\nON CONFLICT DO NOTHING;\n';

  fs.writeFileSync(path.join(MIGRATIONS_DIR, '0004_bart_stops.sql'), sql);
  console.log(`✓ Generated stops migration (${stops.length} stops)`);
}

function generateTripsMigrations() {
  console.log('Generating trips migrations...');
  const trips = parseCSV(path.join(TMP_DIR, 'trips.txt'));

  const CHUNK_SIZE = 500; // Smaller chunks
  const BATCH_SIZE = 100; // Split into multiple INSERT statements
  const chunks = [];
  for (let i = 0; i < trips.length; i += CHUNK_SIZE) {
    chunks.push(trips.slice(i, i + CHUNK_SIZE));
  }

  chunks.forEach((chunk, idx) => {
    let sql = `-- BART Trips (Part ${idx + 1}/${chunks.length})\n`;

    // Split chunk into batches
    for (let i = 0; i < chunk.length; i += BATCH_SIZE) {
      const batch = chunk.slice(i, i + BATCH_SIZE);
      sql += `INSERT INTO trips (provider_id, trip_id, route_id, service_id, trip_headsign, direction_id, block_id, shape_id) VALUES\n`;

      const values = batch.map(t =>
        `(${sqlEscape(PROVIDER_ID)}, ${sqlEscape(t.trip_id)}, ${sqlEscape(t.route_id)}, ${sqlEscape(t.service_id)}, ${sqlEscape(t.trip_headsign)}, ${sqlEscape(t.direction_id)}, ${sqlEscape(t.block_id)}, ${sqlEscape(t.shape_id)})`
      );

      sql += values.join(',\n');
      sql += '\nON CONFLICT DO NOTHING;\n\n';
    }

    const fileNum = String(5 + idx).padStart(4, '0');
    fs.writeFileSync(path.join(MIGRATIONS_DIR, `${fileNum}_bart_trips_${idx + 1}.sql`), sql);
  });

  console.log(`✓ Generated trips migrations (${trips.length} trips in ${chunks.length} files)`);
}

function generateCalendarMigration() {
  console.log('Generating calendar migration...');
  const calendar = parseCSV(path.join(TMP_DIR, 'calendar.txt'));

  let sql = `-- BART Calendar\n`;
  sql += `INSERT INTO calendar (provider_id, service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date) VALUES\n`;

  const values = calendar.map(c =>
    `(${sqlEscape(PROVIDER_ID)}, ${sqlEscape(c.service_id)}, ${sqlEscape(c.monday)}, ${sqlEscape(c.tuesday)}, ${sqlEscape(c.wednesday)}, ${sqlEscape(c.thursday)}, ${sqlEscape(c.friday)}, ${sqlEscape(c.saturday)}, ${sqlEscape(c.sunday)}, ${sqlEscape(c.start_date)}, ${sqlEscape(c.end_date)})`
  );

  sql += values.join(',\n');
  sql += '\nON CONFLICT DO NOTHING;\n';

  // Determine the next file number based on trips migrations
  const trips = parseCSV(path.join(TMP_DIR, 'trips.txt'));
  const tripChunks = Math.ceil(trips.length / 1000);
  const fileNum = String(5 + tripChunks).padStart(4, '0');

  fs.writeFileSync(path.join(MIGRATIONS_DIR, `${fileNum}_bart_calendar.sql`), sql);
  console.log(`✓ Generated calendar migration (${calendar.length} entries)`);
}

function generateStopTimesMigrations() {
  console.log('Generating stop_times migrations (this may take a moment)...');
  const stopTimes = parseCSV(path.join(TMP_DIR, 'stop_times.txt'));

  const CHUNK_SIZE = 2000; // Smaller chunks
  const BATCH_SIZE = 100; // Split into multiple INSERT statements
  const chunks = [];
  for (let i = 0; i < stopTimes.length; i += CHUNK_SIZE) {
    chunks.push(stopTimes.slice(i, i + CHUNK_SIZE));
  }

  // Calculate starting file number
  const trips = parseCSV(path.join(TMP_DIR, 'trips.txt'));
  const tripChunks = Math.ceil(trips.length / 500);
  const startNum = 5 + tripChunks + 1; // After calendar

  chunks.forEach((chunk, idx) => {
    let sql = `-- BART Stop Times (Part ${idx + 1}/${chunks.length})\n`;

    // Split chunk into batches
    for (let i = 0; i < chunk.length; i += BATCH_SIZE) {
      const batch = chunk.slice(i, i + BATCH_SIZE);
      sql += `INSERT INTO stop_times (provider_id, trip_id, stop_id, stop_sequence, arrival_time, departure_time, stop_headsign) VALUES\n`;

      const values = batch.map(st =>
        `(${sqlEscape(PROVIDER_ID)}, ${sqlEscape(st.trip_id)}, ${sqlEscape(st.stop_id)}, ${sqlEscape(st.stop_sequence)}, ${sqlEscape(st.arrival_time)}, ${sqlEscape(st.departure_time)}, ${sqlEscape(st.stop_headsign)})`
      );

      sql += values.join(',\n');
      sql += ';\n\n';
    }

    const fileNum = String(startNum + idx).padStart(4, '0');
    fs.writeFileSync(path.join(MIGRATIONS_DIR, `${fileNum}_bart_stop_times_${idx + 1}.sql`), sql);
  });

  console.log(`✓ Generated stop_times migrations (${stopTimes.length} stop times in ${chunks.length} files)`);
}

function main() {
  console.log('🚆 Generating BART GTFS Static Migrations\n');

  downloadAndExtract();
  generateRoutesMigration();
  generateStopsMigration();
  generateTripsMigrations();
  generateCalendarMigration();
  generateStopTimesMigrations();

  console.log('\n✅ All migrations generated!');
  console.log('\nRun: yarn migrate:local');
}

main();
