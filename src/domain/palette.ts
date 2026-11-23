// Cores dos vídeos: agrupa pixels (k-means simples) e escolhe as que funcionam como cor de legenda.

type RGB = [number, number, number];

const unpack = (p: number): RGB => [(p >> 16) & 255, (p >> 8) & 255, p & 255];

export function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function fromHex(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h /= 6;
  return [h, s, l];
}

export function hslToRgb([h, s, l]: [number, number, number]): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

function kmeans(points: RGB[], k: number, iterations = 12): { center: RGB; size: number }[] {
  if (!points.length) return [];
  // sementes espalhadas pela luminosidade, determinísticas
  const sorted = [...points].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centers: RGB[] = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)]);
  let sizes = new Array(k).fill(0);
  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => [0, 0, 0]);
    sizes = new Array(k).fill(0);
    for (const p of points) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (p[0] - centers[c][0]) ** 2 + (p[1] - centers[c][1]) ** 2 + (p[2] - centers[c][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      sizes[best]++;
    }
    centers = centers.map((c, i) => (sizes[i] ? [sums[i][0] / sizes[i], sums[i][1] / sizes[i], sums[i][2] / sizes[i]] : c));
  }
  return centers.map((center, i) => ({ center, size: sizes[i] }));
}

/**
 * Até 3 cores do vídeo que servem para legenda: as mais vivas e presentes, com tons diferentes
 * entre si, clareadas o suficiente para ler sobre faixa escura ou contorno preto.
 */
export function captionPalette(packedPixels: number[], count = 3): string[] {
  const pts = packedPixels.map(unpack);
  const clusters = kmeans(pts, 8).filter((c) => c.size > 0);
  const total = clusters.reduce((n, c) => n + c.size, 0) || 1;
  const candidates = clusters
    .map((c) => {
      const [h, s, l] = rgbToHsl(c.center);
      return { h, s, l, share: c.size / total, score: s * Math.sqrt(c.size / total) * (l > 0.12 && l < 0.92 ? 1 : 0.2) };
    })
    .filter((c) => c.s > 0.22 && c.share > 0.015)
    .sort((a, b) => b.score - a.score);
  const picked: typeof candidates = [];
  for (const c of candidates) {
    const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
    if (picked.every((p) => hueDist(p.h, c.h) > 0.07)) picked.push(c);
    if (picked.length === count) break;
  }
  return picked.map((c) => toHex(hslToRgb([c.h, Math.min(1, Math.max(0.55, c.s)), Math.min(0.82, Math.max(0.62, c.l))])));
}
