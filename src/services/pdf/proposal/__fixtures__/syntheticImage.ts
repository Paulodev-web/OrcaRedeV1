import zlib from 'node:zlib';

/**
 * Gerador de imagens PNG reais para a fixture.
 *
 * São PNGs de verdade — cabeçalho, IDAT deflacionado, IEND — e não retângulos
 * cinza: o objetivo é exercitar o caminho real de decodificação de imagem do
 * `@react-pdf/renderer`, a proporção das molduras e a legenda por foto, sem
 * versionar binário de obra no repositório.
 *
 * Determinístico: a mesma `seed` sempre produz a mesma imagem, então o PDF da
 * fixture é reproduzível byte a byte.
 */

type RGB = [number, number, number];

/** PRNG determinístico (mulberry32) — nada de `Math.random()` na fixture. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function crc32(buffer: Buffer): number {
  let table = CRC_TABLE;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    CRC_TABLE = table;
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}
let CRC_TABLE: Int32Array | null = null;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** Codifica um buffer RGB (3 bytes/pixel) como PNG color type 2. */
function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filtro None
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export type SceneKind = 'aerea' | 'rede' | 'vala' | 'mapa' | 'subestacao';

interface Painter {
  set: (x: number, y: number, color: RGB) => void;
  rect: (x: number, y: number, w: number, h: number, color: RGB) => void;
  line: (x0: number, y0: number, x1: number, y1: number, color: RGB, weight?: number) => void;
}

function makePainter(width: number, height: number, buffer: Buffer): Painter {
  const set = (x: number, y: number, color: RGB) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const index = (py * width + px) * 3;
    buffer[index] = color[0];
    buffer[index + 1] = color[1];
    buffer[index + 2] = color[2];
  };

  const rect = (x: number, y: number, w: number, h: number, color: RGB) => {
    for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) set(px, py, color);
  };

  const line = (x0: number, y0: number, x1: number, y1: number, color: RGB, weight = 1) => {
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) * 2;
    for (let i = 0; i <= steps; i += 1) {
      const t = steps === 0 ? 0 : i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      for (let w = 0; w < weight; w += 1) for (let h = 0; h < weight; h += 1) set(x + w, y + h, color);
    }
  };

  return { set, rect, line };
}

const SKY_TOP: RGB = [126, 173, 210];
const SKY_LOW: RGB = [206, 224, 236];
const GROUND: RGB = [122, 118, 96];
const ASPHALT: RGB = [88, 92, 96];
const CONCRETE: RGB = [178, 178, 172];
const STEEL: RGB = [96, 104, 112];
const TRENCH: RGB = [104, 84, 62];
const PAPER: RGB = [244, 245, 246];
const NAVY: RGB = [29, 49, 64];
const BLUE: RGB = [100, 171, 222];

function paintScene(kind: SceneKind, width: number, height: number, seed: number): Buffer {
  const buffer = Buffer.alloc(width * height * 3);
  const { set, rect, line } = makePainter(width, height, buffer);
  const random = makeRandom(seed);
  const horizon = Math.round(height * (kind === 'mapa' ? 1 : 0.58));

  // Céu em gradiente + solo, com ruído fino para não ficar chapado.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let color: RGB;
      if (kind === 'mapa') {
        color = PAPER;
      } else if (y < horizon) {
        color = mix(SKY_TOP, SKY_LOW, y / horizon);
      } else {
        const depth = (y - horizon) / Math.max(1, height - horizon);
        color = mix(kind === 'vala' ? TRENCH : GROUND, [58, 62, 48], depth * 0.6);
      }
      const noise = Math.round((random() - 0.5) * (kind === 'mapa' ? 4 : 16));
      set(x, y, [
        Math.min(255, Math.max(0, color[0] + noise)),
        Math.min(255, Math.max(0, color[1] + noise)),
        Math.min(255, Math.max(0, color[2] + noise)),
      ]);
    }
  }

  if (kind === 'mapa') {
    // Planta esquemática: quadra, arruamento e pontos de poste.
    rect(0, 0, width, 6, NAVY);
    rect(0, height - 6, width, 6, NAVY);
    const margin = Math.round(width * 0.08);
    for (let i = 0; i <= 3; i += 1) {
      const y = margin + ((height - margin * 2) / 3) * i;
      line(margin, y, width - margin, y, [188, 194, 200], 2);
    }
    for (let i = 0; i <= 4; i += 1) {
      const x = margin + ((width - margin * 2) / 4) * i;
      line(x, margin, x, height - margin, [188, 194, 200], 2);
    }
    for (let i = 0; i < 26; i += 1) {
      const x = margin + random() * (width - margin * 2);
      const y = margin + random() * (height - margin * 2);
      rect(Math.round(x) - 3, Math.round(y) - 3, 6, 6, BLUE);
    }
    line(margin, height * 0.5, width - margin, height * 0.5, NAVY, 3);
    return buffer;
  }

  if (kind === 'vala') {
    // Vala aberta com dutos e fita de advertência.
    rect(0, horizon, width, height - horizon, TRENCH);
    const trenchTop = Math.round(height * 0.66);
    rect(Math.round(width * 0.12), trenchTop, Math.round(width * 0.76), Math.round(height * 0.2), [
      72, 58, 44,
    ]);
    for (let i = 0; i < 4; i += 1) {
      const y = trenchTop + 10 + i * 9;
      line(width * 0.14, y, width * 0.86, y, i % 2 === 0 ? [196, 92, 60] : [210, 210, 205], 4);
    }
    line(width * 0.12, trenchTop - 8, width * 0.88, trenchTop - 8, [216, 178, 62], 3);
    for (let i = 0; i < 60; i += 1) {
      const x = random() * width;
      const y = horizon + random() * (height - horizon);
      rect(Math.round(x), Math.round(y), 2, 2, [92, 76, 58]);
    }
    return buffer;
  }

  if (kind === 'subestacao') {
    // Base de concreto + transformador pedestal.
    rect(0, horizon, width, height - horizon, GROUND);
    const baseW = Math.round(width * 0.46);
    const baseH = Math.round(height * 0.08);
    const baseX = Math.round((width - baseW) / 2);
    const baseY = Math.round(height * 0.74);
    rect(baseX, baseY, baseW, baseH, CONCRETE);
    const bodyW = Math.round(baseW * 0.78);
    const bodyH = Math.round(height * 0.3);
    const bodyX = Math.round((width - bodyW) / 2);
    rect(bodyX, baseY - bodyH, bodyW, bodyH, [126, 138, 132]);
    rect(bodyX, baseY - bodyH, bodyW, 6, [96, 108, 104]);
    for (let i = 1; i < 5; i += 1) {
      const x = bodyX + (bodyW / 5) * i;
      line(x, baseY - bodyH + 12, x, baseY - 10, [102, 114, 110], 2);
    }
    rect(bodyX + 12, baseY - bodyH + 18, Math.round(bodyW * 0.3), 14, [64, 74, 72]);
    return buffer;
  }

  // 'aerea' e 'rede': postes, cruzetas e condutores.
  rect(0, horizon, width, height - horizon, kind === 'aerea' ? GROUND : ASPHALT);
  if (kind === 'aerea') {
    line(0, horizon + 6, width, horizon + 6, [96, 102, 82], 3);
  }

  const poleCount = kind === 'aerea' ? 5 : 3;
  const poleTops: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < poleCount; i += 1) {
    const x = Math.round((width / (poleCount + 1)) * (i + 1));
    const topY = Math.round(height * (0.12 + random() * 0.06));
    const baseY = horizon + Math.round(height * 0.14);
    line(x, topY, x, baseY, CONCRETE, kind === 'aerea' ? 4 : 6);
    // Cruzeta.
    const armHalf = Math.round(width * 0.045);
    line(x - armHalf, topY + 14, x + armHalf, topY + 14, STEEL, 3);
    for (let k = -1; k <= 1; k += 1) {
      rect(x + k * armHalf - 2, topY + 8, 4, 6, [86, 96, 104]);
    }
    poleTops.push({ x, y: topY + 14 });
  }

  // Condutores em catenária entre os postes.
  for (let i = 0; i < poleTops.length - 1; i += 1) {
    const a = poleTops[i];
    const b = poleTops[i + 1];
    for (let offset = -1; offset <= 1; offset += 1) {
      const sagPx = 10 + Math.abs(offset) * 3;
      const steps = 120;
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        const x = a.x + (b.x - a.x) * t;
        const straight = a.y + (b.y - a.y) * t + offset * 7;
        const y = straight + Math.sin(Math.PI * t) * sagPx;
        set(x, y, [58, 62, 68]);
        set(x, y + 1, [74, 78, 84]);
      }
    }
  }

  return buffer;
}

const cache = new Map<string, string>();

/**
 * Devolve um data URI PNG com a cena pedida. O resultado é memoizado: a mesma
 * foto reaproveitada em várias seções é codificada uma vez só.
 */
export function syntheticPhoto(
  kind: SceneKind,
  seed: number,
  width = 480,
  height = 320,
): string {
  const key = `${kind}:${seed}:${width}x${height}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const png = encodePng(width, height, paintScene(kind, width, height, seed));
  const uri = `data:image/png;base64,${png.toString('base64')}`;
  cache.set(key, uri);
  return uri;
}

/** Marca da empresa em versão simplificada, para o lockup da capa. */
export function syntheticLogo(width = 220, height = 96): string {
  const key = `logo:${width}x${height}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const buffer = Buffer.alloc(width * height * 3);
  const { rect, set } = makePainter(width, height, buffer);
  rect(0, 0, width, height, NAVY);

  // "O" cheio + "N" em azul da marca.
  const cx = Math.round(width * 0.26);
  const cy = Math.round(height * 0.42);
  const radius = Math.round(height * 0.26);
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      if (x * x + y * y <= radius * radius) set(cx + x, cy + y, BLUE);
    }
  }
  const nx = Math.round(width * 0.46);
  const nTop = Math.round(height * 0.16);
  const nBottom = Math.round(height * 0.68);
  const nWidth = Math.round(width * 0.3);
  const stroke = Math.round(width * 0.055);
  rect(nx, nTop, stroke, nBottom - nTop, BLUE);
  rect(nx + nWidth - stroke, nTop, stroke, nBottom - nTop, BLUE);
  for (let i = 0; i <= nBottom - nTop; i += 1) {
    const t = i / (nBottom - nTop);
    rect(Math.round(nx + t * (nWidth - stroke)), nTop + i, stroke, 2, BLUE);
  }
  rect(Math.round(width * 0.2), Math.round(height * 0.78), Math.round(width * 0.6), 5, BLUE);

  const uri = `data:image/png;base64,${encodePng(width, height, buffer).toString('base64')}`;
  cache.set(key, uri);
  return uri;
}

/** Assinatura manuscrita simplificada, fundo branco. */
export function syntheticSignature(width = 260, height = 80): string {
  const key = `sign:${width}x${height}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const buffer = Buffer.alloc(width * height * 3, 255);
  const { set } = makePainter(width, height, buffer);
  const ink: RGB = [26, 38, 58];

  for (let s = 0; s <= 900; s += 1) {
    const t = s / 900;
    const x = 18 + t * (width - 40);
    const y =
      height * 0.6 -
      Math.sin(t * Math.PI * 3.1) * height * 0.2 -
      Math.sin(t * Math.PI * 7.3) * height * 0.07 -
      t * height * 0.12;
    for (let w = 0; w < 2; w += 1) {
      set(x + w, y, ink);
      set(x + w, y + 1, ink);
    }
  }

  const uri = `data:image/png;base64,${encodePng(width, height, buffer).toString('base64')}`;
  cache.set(key, uri);
  return uri;
}
