/**
 * Generates the PWA icon set as real PNG files - no image library needed.
 *
 *   node scripts/generate-icons.mjs
 *
 * Writes:
 *   public/icons/icon-192.png          (any purpose)
 *   public/icons/icon-512.png          (any purpose)
 *   public/icons/maskable-512.png      (maskable: full bleed, art in the safe zone)
 *   public/icons/apple-touch-icon.png  (180x180, opaque, no transparency)
 *
 * The artwork is the app mark: a white calendar page on the brand blue, with a
 * green check badge at the top right (nothing overdue). A calendar rather than
 * any one kind of item, because the app tracks documents, cards, policies and
 * vehicle papers alike. Edit BRAND or the geometry constants and re-run to
 * change it. `public/favicon.svg` is the same mark by hand and should be kept
 * in step.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'public', 'icons');

const BRAND = {
  background: [59, 46, 212], // #3b2ed4 - brand blue, matches primary-600
  glyph: [255, 255, 255], // the calendar
  badge: [34, 197, 94], // #22c55e - the green check circle
};

// ---------------------------------------------------------------------------
// Minimal PNG writer (8-bit RGBA)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One filter byte (0 = None) in front of every scanline.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Geometry. Everything is in normalised coordinates so one description renders
// at any size; edges are anti-aliased by 4x4 supersampling in `render`.
// ---------------------------------------------------------------------------

/** Inside test for a rounded square covering [-half, half]. */
function insideRoundedSquare(x, y, half, radius) {
  const dx = Math.abs(x) - (half - radius);
  const dy = Math.abs(y) - (half - radius);
  if (dx <= 0 || dy <= 0) return Math.abs(x) <= half && Math.abs(y) <= half;
  return dx * dx + dy * dy <= radius * radius;
}

/** Inside test for an axis-aligned rounded rectangle. */
function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/** Distance from a point to the segment a-b. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSquared = abx * abx + aby * aby;
  let t = lengthSquared === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (ax + t * abx);
  const dy = py - (ay + t * aby);
  return Math.sqrt(dx * dx + dy * dy);
}

/** White where the point is within `thickness` of the polyline (round joins). */
function nearPolyline(x, y, points, thickness) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    if (distanceToSegment(x, y, ax, ay, bx, by) <= thickness) return true;
  }
  return false;
}

// --- the calendar ----------------------------------------------------------
const CAL_CENTRE = [0, 0.08]; // nudged down; the badge occupies the top right
// The page, drawn as a thick rounded outline so the middle shows the field.
const PAGE = { left: -0.6, top: -0.38, right: 0.6, bottom: 0.56, radius: 0.14 };
const PAGE_STROKE = 0.1;
// The solid header band across the top of the page.
const HEADER_BOTTOM = -0.12;
// Two binding rings standing above the header.
const RINGS = [-0.3, 0.3];
const RING_TOP = -0.58;
const RING_WIDTH = 0.055;
// Date marks on the page body: two rows of short dashes.
const MARK_ROWS = [0.12, 0.34];
const MARK_COLUMNS = [-0.28, 0, 0.28];
const MARK_WIDTH = 0.11;
const MARK_HEIGHT = 0.045;

// --- the check badge -------------------------------------------------------
// On the rounded square the badge hugs the top-right corner, as in the source
// artwork. A maskable icon may be cropped to a circle, so there the badge tucks
// in against the car to form a compact, centred lockup instead.
const BADGE_CENTRE = [0.7, -0.7];
const BADGE_CENTRE_MASKABLE = [0.5, -0.46];
const BADGE_RADIUS = 0.29;
const BADGE_RING = 0.042; // white separation from the blue field
const CHECK = [
  [-0.115, 0.005],
  [-0.03, 0.09],
  [0.125, -0.085],
];
const CHECK_THICKNESS = 0.045;

/** Centre of the artwork's bounding box, used to re-centre the group. */
function artBoundsCentre(badgeCentre) {
  const left = CAL_CENTRE[0] + PAGE.left;
  const right = badgeCentre[0] + BADGE_RADIUS + BADGE_RING;
  const top = Math.min(badgeCentre[1] - BADGE_RADIUS - BADGE_RING, CAL_CENTRE[1] + RING_TOP);
  const bottom = CAL_CENTRE[1] + PAGE.bottom;
  return [(left + right) / 2, (top + bottom) / 2];
}

/**
 * Classifies one sample point of the artwork.
 * Returns 'glyph' | 'badge' | 'badge-ring' | 'check' | null.
 */
function sampleArt(gx, gy, badgeCentre) {
  // Badge first: it sits on top of everything.
  const bx = gx - badgeCentre[0];
  const by = gy - badgeCentre[1];
  const badgeDistance = Math.sqrt(bx * bx + by * by);
  if (badgeDistance <= BADGE_RADIUS) {
    return nearPolyline(bx, by, CHECK, CHECK_THICKNESS) ? 'check' : 'badge';
  }
  if (badgeDistance <= BADGE_RADIUS + BADGE_RING) return 'badge-ring';

  // Calendar, in its own centred space.
  const cx = gx - CAL_CENTRE[0];
  const cy = gy - CAL_CENTRE[1];

  // Binding rings, above the page.
  for (const rx of RINGS) {
    if (
      insideRoundedRect(
        cx, cy,
        rx - RING_WIDTH, RING_TOP,
        rx + RING_WIDTH, PAGE.top + PAGE_STROKE,
        RING_WIDTH,
      )
    ) {
      return 'glyph';
    }
  }

  const inPage = insideRoundedRect(
    cx, cy, PAGE.left, PAGE.top, PAGE.right, PAGE.bottom, PAGE.radius,
  );
  if (!inPage) return null;

  // The solid header band.
  if (cy <= HEADER_BOTTOM) return 'glyph';

  // The page outline: inside the page but outside its inset.
  const inInterior = insideRoundedRect(
    cx, cy,
    PAGE.left + PAGE_STROKE, PAGE.top + PAGE_STROKE,
    PAGE.right - PAGE_STROKE, PAGE.bottom - PAGE_STROKE,
    Math.max(0.01, PAGE.radius - PAGE_STROKE),
  );
  if (!inInterior) return 'glyph';

  // Date marks on the page body.
  for (const my of MARK_ROWS) {
    for (const mx of MARK_COLUMNS) {
      if (
        insideRoundedRect(
          cx, cy,
          mx - MARK_WIDTH / 2, my - MARK_HEIGHT / 2,
          mx + MARK_WIDTH / 2, my + MARK_HEIGHT / 2,
          MARK_HEIGHT / 2,
        )
      ) {
        return 'glyph';
      }
    }
  }

  return null;
}


/**
 * Renders one icon.
 *
 * maskable: true  -> full-bleed background, art shrunk into the 80% safe zone
 *                    that Android may crop to a circle.
 *           false -> rounded-square badge on a transparent canvas.
 * opaque:   fill the transparent corners with white (iOS dislikes alpha).
 */
function render(size, { maskable = false, opaque = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4; // 4x4 supersampling
  const total = samples * samples;
  const artScale = maskable ? 0.74 : 0.9;
  const cornerRadius = 0.44;

  const badgeCentre = maskable ? BADGE_CENTRE_MASKABLE : BADGE_CENTRE;
  // The square variant is used as authored; the maskable one is re-centred.
  const [shiftX, shiftY] = maskable ? artBoundsCentre(badgeCentre) : [0, 0];

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let bgHits = 0;
      const paint = { glyph: 0, badge: 0, 'badge-ring': 0, check: 0 };

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          // Normalised device coordinates in [-1, 1].
          const nx = ((px + (sx + 0.5) / samples) / size) * 2 - 1;
          const ny = ((py + (sy + 0.5) / samples) / size) * 2 - 1;

          if (maskable || insideRoundedSquare(nx, ny, 0.98, cornerRadius)) bgHits += 1;

          const part = sampleArt(
            nx / artScale + shiftX,
            ny / artScale + shiftY,
            badgeCentre,
          );
          if (part) paint[part] += 1;
        }
      }

      let [r, g, b] = BRAND.background;
      let a = bgHits / total;

      if (opaque && a < 1) {
        // Composite the badge over white instead of leaving transparency.
        r = r * a + 255 * (1 - a);
        g = g * a + 255 * (1 - a);
        b = b * a + 255 * (1 - a);
        a = 1;
      }

      // Painted in back-to-front order.
      const layers = [
        [paint.glyph / total, BRAND.glyph],
        [paint['badge-ring'] / total, BRAND.glyph],
        [paint.badge / total, BRAND.badge],
        [paint.check / total, BRAND.glyph],
      ];

      for (const [coverage, colour] of layers) {
        if (coverage <= 0) continue;
        r = r * (1 - coverage) + colour[0] * coverage;
        g = g * (1 - coverage) + colour[1] * coverage;
        b = b * (1 - coverage) + colour[2] * coverage;
        a = Math.max(a, coverage);
      }

      const offset = (py * size + px) * 4;
      rgba[offset] = Math.round(Math.max(0, Math.min(255, r)));
      rgba[offset + 1] = Math.round(Math.max(0, Math.min(255, g)));
      rgba[offset + 2] = Math.round(Math.max(0, Math.min(255, b)));
      rgba[offset + 3] = Math.round(Math.max(0, Math.min(255, a * 255)));
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', render(192)],
  ['icon-512.png', render(512)],
  ['maskable-512.png', render(512, { maskable: true })],
  ['apple-touch-icon.png', render(180, { opaque: true })],
];

for (const [name, buffer] of targets) {
  const path = resolve(OUT_DIR, name);
  writeFileSync(path, buffer);
  console.log('wrote %s (%d bytes)', path, buffer.length);
}
