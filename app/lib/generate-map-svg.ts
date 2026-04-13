import { tracks, markers, OX, OY, MAP_DIMENSIONS } from "~/components/bart-map";

const { width: MAP_W, height: MAP_H } = MAP_DIMENSIONS;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function generateMapSvg(): string {
  const lines: string[] = [];

  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_W} ${MAP_H}" width="${MAP_W}" height="${MAP_H}">`,
  );
  lines.push(
    `<style>text { font-family: 'Berkeley Mono', ui-monospace, monospace; font-size: 11px; font-weight: bold; }</style>`,
  );

  // Track segments
  for (const seg of tracks) {
    lines.push(
      `<rect x="${seg.x + OX}" y="${seg.y + OY}" width="${seg.w}" height="${seg.h}" fill="${seg.color}" stroke="black" stroke-width="1"/>`,
    );
  }

  // Station markers
  for (const mk of markers) {
    lines.push(
      `<rect x="${mk.mx + OX}" y="${mk.my + OY}" width="${mk.mw}" height="${mk.mh}" fill="white" stroke="black" stroke-width="1"/>`,
    );

    const name = escapeXml(mk.name);

    if (mk.rotated) {
      // CSS: right edge at lx+OX, top at ly+OY, transform-origin: bottom right, rotate(50deg)
      // The pivot is the bottom-right corner of the text box: (lx+OX, ly+OY+14)
      // In SVG text-anchor="end" places the text end at x, and y is the baseline.
      // We place the baseline at the pivot point and rotate -50deg around it.
      const px = mk.lx + OX;
      const py = mk.ly + OY + 14; // bottom of text box (LABEL_H=14)
      lines.push(
        `<text x="${px}" y="${py}" text-anchor="end" transform="rotate(50, ${px}, ${py})" fill="black">${name}</text>`,
      );
    } else {
      const anchor = mk.anchor === "end" ? "end" : "start";
      const tx = mk.lx + OX;
      const ty = mk.ly + OY - 6 + 9; // CSS top + vertical centering (~9px baseline offset for 11px)
      lines.push(
        `<text x="${tx}" y="${ty}" text-anchor="${anchor}" fill="black">${name}</text>`,
      );
    }
  }

  lines.push("</svg>");
  return lines.join("\n");
}
