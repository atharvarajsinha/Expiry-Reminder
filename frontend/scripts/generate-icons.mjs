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
 * The artwork is the app mark: a white car on the brand blue, with a green
 * check badge at the top right (documents in good standing). Edit BRAND or the
 * geometry constants and re-run to change it. `public/favicon.svg` is the same
 * mark by hand and should be kept in step.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'public', 'icons');

const BRAND = {
  background: [59, 46, 212], // #3b2ed4 - brand blue, matches primary-600
  glyph: [255, 255, 255], // the car
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

// --- the car ---------------------------------------------------------------
const CAR_CENTRE = [0, 0.1]; // nudged down; the badge occupies the top right
const BODY = { left: -0.62, top: -0.02, right: 0.62, bottom: 0.24, radius: 0.1 };
// Roof drawn as a thick outline, so the window is the background showing through.
const CABIN = [
  [-0.42, 0.0],
  [-0.2, -0.28],
  [0.2, -0.28],
  [0.42, 0.0],
];
const CABIN_THICKNESS = 0.078;
const WHEELS = [
  [-0.34, 0.33],
  [0.32, 0.33],
];
const WHEEL_OUTER = 0.16;
const WHEEL_HUB = 0.072;

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
  const left = CAR_CENTRE[0] + BODY.left;
  const right = badgeCentre[0] + BADGE_RADIUS + BADGE_RING;
  const top = badgeCentre[1] - BADGE_RADIUS - BADGE_RING;
  const bottom = CAR_CENTRE[1] + WHEELS[0][1] + WHEEL_OUTER;
  return [(left + right) / 2, (top + bottom) / 2];
}

/**
 * Classifies one sample point of the artwork.
 * Returns 'car' | 'badge' | 'badge-ring' | 'check' | null.
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

  // Car, in its own centred space.
  const cx = gx - CAR_CENTRE[0];
  const cy = gy - CAR_CENTRE[1];

  // Hubs punch through the body and the tyres.
  for (const [wx, wy] of WHEELS) {
    const dx = cx - wx;
    const dy = cy - wy;
    if (Math.sqrt(dx * dx + dy * dy) <= WHEEL_HUB) return null;
  }

  if (insideRoundedRect(cx, cy, BODY.left, BODY.top, BODY.right, BODY.bottom, BODY.radius)) {
    return 'car';
  }
  if (nearPolyline(cx, cy, CABIN, CABIN_THICKNESS)) return 'car';

  for (const [wx, wy] of WHEELS) {
    const dx = cx - wx;
    const dy = cy - wy;
    if (Math.sqrt(dx * dx + dy * dy) <= WHEEL_OUTER) return 'car';
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
      const paint = { car: 0, badge: 0, 'badge-ring': 0, check: 0 };

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
        [paint.car / total, BRAND.glyph],
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
