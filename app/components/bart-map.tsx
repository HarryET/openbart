// BART system map — CSS absolute positioning replicating the classic schematic.
// Each line is a continuous colored filled rectangle (like the reference SVG).
// Station markers are small rectangles overlaid on the tracks.

import { Link } from "react-router";

export interface StationStatus {
  abbr: string;
  trains?: number;
  delay?: boolean;
}

export const LINE_COLORS = {
  red: "#d40000",
  orange: "#ff6600",
  yellow: "#ffd700",
  blue: "#0099cc",
  green: "#339933",
} as const;

const T = 10; // track band width
const ROW = 30; // station spacing

// ==========================================
// LAYOUT — matches reference SVG topology
// ==========================================
// One main vertical trunk runs top to bottom at X_MAIN.
// Richmond (red+orange) runs top section, joined by yellow from right.
// Below crossbar: left trunk = SF, right trunk = East Bay.

// X positions
const X_MAIN = 480; // main vertical trunk center (Richmond + Oakland)
const X_ANTI = 610; // Antioch branch vertical
const X_SF = 145; // SF trunk left edge
const X_EB = 480; // East Bay trunk left edge (same x as main)
const X_SFO = 230; // SFO branch endpoint (right of SF trunk)

// Y positions for each station row
const Y0 = 70; // top padding — must be >= 2*ROW so Antioch branch (y(0)-2*ROW) stays positive
const y = (row: number) => Y0 + row * ROW;

// Richmond branch (rows 0-5)
const Y_RICH = y(0);
const Y_DELN = y(1);
const Y_PLZA = y(2);
const Y_NBRK = y(3);
const Y_DBRK = y(4);
const Y_ASHB = y(5);

// Antioch branch (right side, Antioch & Pittsburg Center above Bay Point)
const Y_ANTC = y(0) - 2 * ROW; // Antioch
const Y_PCTR = y(0) - ROW; // Pittsburg Center
const Y_PITT = y(0);
const Y_NCON = y(1);
const Y_CONC = y(2);
const Y_PHIL = y(3);
const Y_WCRK = y(4);
const Y_LAFY = y(5);
const Y_ORIN = y(6);

// Oakland trunk after merge — Rockridge is on the horizontal connector
const Y_ROCK = y(6) + 20; // Rockridge on horizontal connector, below Orinda with room for label
const Y_MCAR = y(8);
const Y_19TH = y(9);
const Y_12TH = y(10);

// Horizontal crossbar (row 11) — extra gap before it for rotated labels
const Y_CROSS = y(11) + 10;

// SF trunk below crossbar — extra gap for clearance from rotated crossbar labels
const Y_16TH = Y_CROSS + 4 * T + 25; // 4 bands + gap
const Y_24TH = Y_16TH + ROW;
const Y_GLEN = Y_24TH + ROW;
const Y_BALB = Y_GLEN + ROW;
const Y_DALY = Y_BALB + ROW;
const Y_COLM = Y_DALY + ROW;
const Y_SSAN = Y_COLM + ROW;
const Y_SBRN = Y_SSAN + ROW;
const Y_SFIA = Y_SBRN + ROW; // SFO branches horizontally between San Bruno and Millbrae
const Y_MLBR = Y_SFIA + ROW;

// East Bay trunk below crossbar
const Y_LAKE = Y_16TH;
const Y_FTVL = Y_LAKE + ROW;
const Y_COLS = Y_FTVL + ROW;
const Y_SANL = Y_COLS + ROW;
const Y_BAYF = Y_SANL + ROW;

// Dublin branch sits between Bay Fair and Hayward (extra gap for rotated labels)
const Y_DUBL = Y_BAYF + ROW + 35;

const Y_HAYW = Y_DUBL + ROW + 15;
const Y_SHAY = Y_HAYW + ROW;
const Y_UCTY = Y_SHAY + ROW;
const Y_FRMT = Y_UCTY + ROW;

// Warm Springs extension
const Y_WARM = Y_FRMT + ROW;
const Y_MLPT = Y_WARM + ROW;
const Y_BERY = Y_MLPT + ROW;

// Char width estimate for Berkeley Mono bold at 11px (monospace ~6.6px per char)
const CHAR_W = 6.6;
const LABEL_H = 14; // line height for 11px text

// ==========================================
// TRACK SEGMENTS
// ==========================================
export interface TrackSeg {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

function buildTracks(): TrackSeg[] {
  const segs: TrackSeg[] = [];
  const V = (x: number, y1: number, y2: number, c: string) =>
    segs.push({ x, y: y1, w: T, h: y2 - y1, color: c });
  const H = (x1: number, x2: number, yy: number, c: string) =>
    segs.push({ x: x1, y: yy, w: x2 - x1, h: T, color: c });

  // Crossbar bottom edge — 4 bands cross the bay (red, yellow, green, blue)
  const CROSS_BOT = Y_CROSS + 4 * T;

  // === RED: Richmond → Oakland → crossbar left turn → SF → Millbrae ===
  // Main trunk vertical (top to crossbar top)
  V(X_MAIN, Y_RICH, Y_CROSS, LINE_COLORS.red);
  // Crossbar horizontal (red is band 0) — starts at SF vertical position
  H(X_SF, X_EB + 3 * T, Y_CROSS, LINE_COLORS.red);
  // SF vertical: from crossbar band 0 down to Millbrae
  V(X_SF, Y_CROSS, Y_MLBR + T, LINE_COLORS.red);

  // === ORANGE: Richmond → Oakland → straight down to East Bay → Berryessa ===
  // Orange does NOT cross the bay — goes straight down the right side
  // Main trunk vertical (down through crossbar zone to East Bay)
  V(X_MAIN + T, Y_RICH, CROSS_BOT, LINE_COLORS.orange);
  // East Bay vertical: slot 1 (middle)
  V(X_EB + T, CROSS_BOT, Y_BERY + T, LINE_COLORS.orange);

  // === YELLOW: Antioch → horizontal to main → Oakland → crossbar left turn → SF → SFO ===
  // Antioch vertical — from Antioch down past Orinda to the connector at Rockridge level
  V(X_ANTI, Y_ANTC, Y_ROCK + T, LINE_COLORS.yellow);
  // Horizontal connector from Antioch to main trunk (Rockridge is on this segment)
  H(X_MAIN + 2 * T, X_ANTI + T, Y_ROCK, LINE_COLORS.yellow);
  // Main trunk from connector down to crossbar
  V(X_MAIN + 2 * T, Y_ROCK, Y_CROSS + T, LINE_COLORS.yellow);
  // Crossbar horizontal (yellow is band 1) — starts one band right of red
  H(X_SF + T, X_EB + 3 * T, Y_CROSS + T, LINE_COLORS.yellow);
  // SF vertical: from crossbar band 1 down to SFO level
  V(X_SF + T, Y_CROSS + T, Y_SFIA + T, LINE_COLORS.yellow);
  // SFO horizontal branch from SF trunk (goes right)
  H(X_SF + T, X_SFO + T, Y_SFIA, LINE_COLORS.yellow);

  // === GREEN: Daly City ← crossbar → folds down → East Bay → Berryessa ===
  // SF vertical: from crossbar band 2 down to Daly City
  V(X_SF + 2 * T, Y_CROSS + 2 * T, Y_DALY + T, LINE_COLORS.green);
  // Crossbar horizontal (green is band 2) — starts two bands right
  H(X_SF + 2 * T, X_EB, Y_CROSS + 2 * T, LINE_COLORS.green);
  // East Bay vertical: slot 0 — connects from green's band down
  V(X_EB, Y_CROSS + 2 * T, Y_BERY + T, LINE_COLORS.green);

  // === BLUE: Dublin ← Bay Fair ← East Bay ← crossbar → SF → Daly City ===
  // SF vertical: from crossbar band 3 down to Daly City
  V(X_SF + 3 * T, Y_CROSS + 3 * T, Y_DALY + T, LINE_COLORS.blue);
  // Crossbar horizontal (blue is band 3) — starts three bands right
  H(X_SF + 3 * T, X_EB + 2 * T, Y_CROSS + 3 * T, LINE_COLORS.blue);
  // East Bay vertical: slot 2 — connects from blue's band down
  V(X_EB + 2 * T, Y_CROSS + 3 * T, Y_DUBL + T, LINE_COLORS.blue);
  // Dublin horizontal branch — ends at Dublin/Pleasanton station (770 + T)
  H(X_EB + 2 * T, 770 + T, Y_DUBL, LINE_COLORS.blue);

  return segs;
}

export const tracks = buildTracks();

// ==========================================
// STATION MARKERS
// ==========================================
export interface Marker {
  abbr: string;
  name: string;
  transfer?: boolean;
  // marker rect
  mx: number;
  my: number;
  mw: number;
  mh: number;
  // label
  lx: number;
  ly: number;
  anchor: "end" | "start";
  rotated?: boolean; // rotate -50deg (for crossbar labels above)
}

function buildMarkers(): Marker[] {
  const m: Marker[] = [];

  // Helper: vertical trunk station (horizontal marker bar across bands)
  const vStation = (
    abbr: string,
    name: string,
    x: number,
    yy: number,
    bands: number,
    labelSide: "l" | "r",
    transfer?: boolean,
  ) => {
    const mw = bands * T + 6;
    m.push({
      abbr,
      name,
      transfer,
      mx: x - 3,
      my: yy,
      mw,
      mh: T,
      lx: labelSide === "l" ? x - 6 : x + bands * T + 6,
      ly: yy + T / 2,
      anchor: labelSide === "l" ? "end" : "start",
    });
  };

  // Helper: horizontal trunk station (vertical marker bar across bands)
  const hStation = (
    abbr: string,
    name: string,
    xx: number,
    y: number,
    bands: number,
    transfer?: boolean,
  ) => {
    const mh = bands * T + 6;
    m.push({
      abbr,
      name,
      transfer,
      mx: xx,
      my: y - 3,
      mw: T,
      mh,
      lx: xx,
      ly: y - 20,
      anchor: "start",
      rotated: true,
    });
  };

  // Richmond branch: 2 bands (red, orange)
  vStation("RICH", "Richmond", X_MAIN, Y_RICH, 2, "l");
  vStation("DELN", "El Cerrito del Norte", X_MAIN, Y_DELN, 2, "l");
  vStation("PLZA", "El Cerrito Plaza", X_MAIN, Y_PLZA, 2, "l");
  vStation("NBRK", "North Berkeley", X_MAIN, Y_NBRK, 2, "l");
  vStation("DBRK", "Downtown Berkeley", X_MAIN, Y_DBRK, 2, "l");
  vStation("ASHB", "Ashby", X_MAIN, Y_ASHB, 2, "l");

  // Antioch branch: 1 band (yellow)
  vStation("ANTC", "Antioch", X_ANTI, Y_ANTC, 1, "r");
  vStation("PCTR", "Pittsburg Center", X_ANTI, Y_PCTR, 1, "r");
  vStation("PITT", "Pittsburg/Bay Point", X_ANTI, Y_PITT, 1, "r");
  vStation("NCON", "North Concord/Martinez", X_ANTI, Y_NCON, 1, "r");
  vStation("CONC", "Concord", X_ANTI, Y_CONC, 1, "r");
  vStation("PHIL", "Pleasant Hill", X_ANTI, Y_PHIL, 1, "r");
  vStation("WCRK", "Walnut Creek", X_ANTI, Y_WCRK, 1, "r");
  vStation("LAFY", "Lafayette", X_ANTI, Y_LAFY, 1, "r");
  vStation("ORIN", "Orinda", X_ANTI, Y_ORIN, 1, "r");

  // Rockridge: yellow-only station on the horizontal connector, rotated label above
  const rockX = X_MAIN + 2 * T + 60;
  m.push({
    abbr: "ROCK",
    name: "Rockridge",
    mx: rockX,
    my: Y_ROCK - 3,
    mw: T,
    mh: T + 6,
    lx: rockX,
    ly: Y_ROCK - 20,
    anchor: "start",
    rotated: true,
  });

  // Oakland trunk: 3 bands (red, orange, yellow) from MacArthur down
  vStation("MCAR", "MacArthur", X_MAIN, Y_MCAR, 3, "r", true);
  vStation("19TH", "19th St-Oakland", X_MAIN, Y_19TH, 3, "r");
  vStation("12TH", "12th St-Oakland City Center", X_MAIN, Y_12TH, 3, "r", true);

  // Crossbar stations: 4 bands (rotated labels)
  // Positioned right of the SF junction (SF trunk spans X_SF to X_SF + 4T)
  hStation("CIVC", "Civic Center", X_SF + 4 * T + 15, Y_CROSS, 4);
  hStation("POWL", "Powell", X_SF + 4 * T + 50, Y_CROSS, 4);
  hStation("MONT", "Montgomery", X_SF + 4 * T + 85, Y_CROSS, 4);
  hStation("EMBR", "Embarcadero", X_SF + 4 * T + 125, Y_CROSS, 4);
  hStation("WOAK", "West Oakland", X_SF + 4 * T + 230, Y_CROSS, 4);

  // Lake Merritt: first East Bay station below crossbar, label to the right
  vStation("LAKE", "Lake Merritt", X_EB, Y_LAKE, 3, "r");

  // SF trunk: 4 bands (red, yellow, green, blue) to Daly City, then 2 (red, yellow) to San Bruno
  vStation("16TH", "16th St/Mission", X_SF, Y_16TH, 4, "l");
  vStation("24TH", "24th St/Mission", X_SF, Y_24TH, 4, "l");
  vStation("GLEN", "Glen Park", X_SF, Y_GLEN, 4, "l");
  vStation("BALB", "Balboa Park", X_SF, Y_BALB, 4, "l", true);
  vStation("DALY", "Daly City", X_SF, Y_DALY, 4, "l");
  vStation("COLM", "Colma", X_SF, Y_COLM, 2, "l");
  vStation("SSAN", "South San Francisco", X_SF, Y_SSAN, 2, "l");
  vStation("SBRN", "San Bruno", X_SF, Y_SBRN, 2, "l", true);
  vStation("MLBR", "Millbrae", X_SF, Y_MLBR, 1, "l");

  // SFO: horizontal branch marker at right end, label to the right
  m.push({
    abbr: "SFIA",
    name: "SFO",
    mx: X_SFO,
    my: Y_SFIA - 3,
    mw: T,
    mh: T + 6,
    lx: X_SFO + T + 6,
    ly: Y_SFIA + T / 2,
    anchor: "start",
  });

  // East Bay trunk: 3 bands (orange, green, blue) to Bay Fair, then 2 (orange, green) to Fremont
  vStation("FTVL", "Fruitvale", X_EB, Y_FTVL, 3, "r");
  vStation("COLS", "Coliseum/Oakland Airport", X_EB, Y_COLS, 3, "r");
  vStation("SANL", "San Leandro", X_EB, Y_SANL, 3, "r");
  vStation("BAYF", "Bay Fair", X_EB, Y_BAYF, 3, "r", true);
  vStation("HAYW", "Hayward", X_EB, Y_HAYW, 2, "r");
  vStation("SHAY", "South Hayward", X_EB, Y_SHAY, 2, "r");
  vStation("UCTY", "Union City", X_EB, Y_UCTY, 2, "r");
  vStation("FRMT", "Fremont", X_EB, Y_FRMT, 2, "r");
  vStation("WARM", "Warm Springs/South Fremont", X_EB, Y_WARM, 2, "r");
  vStation("MLPT", "Milpitas", X_EB, Y_MLPT, 2, "r");
  vStation("BERY", "Berryessa/North San Jose", X_EB, Y_BERY, 2, "r");

  // Dublin branch: horizontal, 1 band (blue)
  // Castro Valley and West Dublin: rotated labels above
  const dubX = [650, 710];
  const dubNames = ["Castro Valley", "West Dublin"];
  const dubAbbrs = ["CAST", "WDUB"];
  for (let i = 0; i < 2; i++) {
    m.push({
      abbr: dubAbbrs[i],
      name: dubNames[i],
      mx: dubX[i],
      my: Y_DUBL - 3,
      mw: T,
      mh: T + 6,
      lx: dubX[i],
      ly: Y_DUBL - 20,
      anchor: "start",
      rotated: true,
    });
  }
  // Dublin/Pleasanton: rotated label above
  m.push({
    abbr: "DUBL",
    name: "Dublin/Pleasanton",
    mx: 770,
    my: Y_DUBL - 3,
    mw: T,
    mh: T + 6,
    lx: 770,
    ly: Y_DUBL - 20,
    anchor: "start",
    rotated: true,
  });

  return m;
}

export const markers = buildMarkers();

export const stations = markers.map((m) => ({
  abbr: m.abbr,
  name: m.name,
  x: m.mx,
  y: m.my,
  labelSide: m.anchor === "end" ? ("l" as const) : ("r" as const),
  transfer: m.transfer,
}));

// ==========================================
// STATIC BOUNDING BOX
// ==========================================
// Compute the tight bounding box from tracks + markers so the container fits exactly.

function computeBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // Track segments
  for (const seg of tracks) {
    minX = Math.min(minX, seg.x);
    minY = Math.min(minY, seg.y);
    maxX = Math.max(maxX, seg.x + seg.w);
    maxY = Math.max(maxY, seg.y + seg.h);
  }

  // Station markers
  for (const mk of markers) {
    minX = Math.min(minX, mk.mx);
    minY = Math.min(minY, mk.my);
    maxX = Math.max(maxX, mk.mx + mk.mw);
    maxY = Math.max(maxY, mk.my + mk.mh);

    const textW = mk.name.length * CHAR_W;

    if (mk.rotated) {
      // The label is positioned via `right:` so its right edge is at lx.
      // The text box before rotation: left=lx-textW, top=ly, right=lx, bottom=ly+LABEL_H.
      // transform-origin is bottom-right, rotation is 50deg clockwise.
      const rad = (50 * Math.PI) / 180;
      const cos50 = Math.cos(rad);
      const sin50 = Math.sin(rad);
      // Origin = bottom-right corner = (lx, ly + LABEL_H)
      const ox = mk.lx, oy = mk.ly + LABEL_H;
      // Corners relative to origin, then rotated
      const corners = [
        [-textW, -LABEL_H], // top-left
        [0, -LABEL_H],      // top-right
        [-textW, 0],         // bottom-left
        [0, 0],              // bottom-right (stays put)
      ];
      for (const [cx, cy] of corners) {
        const rx = ox + cx * cos50 - cy * sin50;
        const ry = oy + cx * sin50 + cy * cos50;
        minX = Math.min(minX, rx);
        minY = Math.min(minY, ry);
        maxX = Math.max(maxX, rx);
        maxY = Math.max(maxY, ry);
      }
    } else if (mk.anchor === "end") {
      // Right-aligned: text extends left from lx
      minX = Math.min(minX, mk.lx - textW);
      minY = Math.min(minY, mk.ly - 6);
      maxY = Math.max(maxY, mk.ly - 6 + LABEL_H);
    } else {
      // Left-aligned: text extends right from lx
      maxX = Math.max(maxX, mk.lx + textW);
      minY = Math.min(minY, mk.ly - 6);
      maxY = Math.max(maxY, mk.ly - 6 + LABEL_H);
    }
  }

  // Add 3px padding to account for rounding and sub-pixel rendering
  return { minX: Math.floor(minX) - 1, minY: Math.floor(minY), maxX: Math.ceil(maxX) + 2, maxY: Math.ceil(maxY) + 3 };
}

const BOUNDS = computeBounds();
export const OX = -BOUNDS.minX; // offset to shift content so it starts at x=0
export const OY = -BOUNDS.minY; // offset to shift content so it starts at y=0
const MAP_W = BOUNDS.maxX - BOUNDS.minX;
const MAP_H = BOUNDS.maxY - BOUNDS.minY;

export const MAP_DIMENSIONS = { width: MAP_W, height: MAP_H } as const;

// ==========================================
// COMPONENT
// ==========================================
interface BartMapProps {
  stationStatuses?: Map<string, StationStatus>;
}

export function BartMap({ stationStatuses }: BartMapProps) {
  return (
    <div
      className="relative"
      style={{
        width: MAP_W,
        height: MAP_H,
        fontFamily: "'Berkeley Mono', ui-monospace, monospace",
      }}
    >
      {/* Colored track segments */}
      {tracks.map((seg, i) => (
        <div
          key={`t${i}`}
          className="absolute"
          style={{
            left: seg.x + OX,
            top: seg.y + OY,
            width: seg.w,
            height: seg.h,
            backgroundColor: seg.color,
            border: "1px solid black",
            boxSizing: "border-box",
          }}
        />
      ))}

      {/* Station markers + labels */}
      {markers.map((mk) => {
        const status = stationStatuses?.get(mk.abbr);
        const isDelay = status?.delay;
        const showRed = isDelay;

        return (
          <Link
            key={mk.abbr}
            to={`/s/${mk.abbr}`}
            data-station={mk.abbr}
            className="group"
          >
            {/* Marker rectangle */}
            <div
              className="absolute bg-white cursor-pointer group-hover:bg-black"
              style={{
                left: mk.mx + OX,
                top: mk.my + OY,
                width: mk.mw,
                height: mk.mh,
                border: "1px solid black",
                zIndex: 10,
              }}
            />

            {/* Label */}
            {mk.rotated ? (
              <div
                className={`absolute text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                  showRed ? "text-[#d40000]" : "text-black"
                }`}
                style={{
                  right: MAP_W - (mk.lx + OX),
                  top: mk.ly + OY,
                  transform: "rotate(50deg)",
                  transformOrigin: "bottom right",
                  zIndex: 20,
                }}
              >
                {mk.name}
              </div>
            ) : (
              <div
                className={`absolute text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                  showRed ? "text-[#d40000]" : "text-black"
                }`}
                style={{
                  ...(mk.anchor === "end"
                    ? { right: MAP_W - (mk.lx + OX) }
                    : { left: mk.lx + OX }),
                  top: mk.ly + OY - 6,
                  zIndex: 20,
                }}
              >
                {mk.name}
                {status?.trains !== undefined && (
                  <span className="text-[9px] text-gray-500 ml-1">
                    ({status.trains})
                  </span>
                )}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
