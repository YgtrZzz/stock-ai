/**
 * Motor de Reconhecimento Visual de Produtos (Edge AI Visual Matcher v3 — Offline-First)
 * - Foca no Núcleo Central do Objeto (x: 25%..75%, y: 22%..78%), eliminando interferência do fundo do ambiente.
 * - Extrai mapa 2D 12x12 de Luminância (Y), Crominância (Cb, Cr) e Densidade de Bordas (|dx|+|dy|),
 *   combinado com Histograma Gaussiano de 20 bins do centro estrito do objeto.
 * - Executa Template Matching 8x8 deslizante (dx, dy em [-2..+2]) com ponderação Gaussiana central
 *   para tolerar variações de posição da mão e distância da câmera.
 */

import {
  decodeBase64PayloadBytes,
  decodeJpegDcGrid,
} from './imagePreprocessor.js';

const MAX_SIGNATURE_JSON_BYTES = 48 * 1024; // 48 KB
const PATCH_SIDE = 12;
const PATCH_CELLS = PATCH_SIDE * PATCH_SIDE; // 144
const HIST_BINS = 20;
const DHASH_BITS = 64;
const DEFAULT_MATCH_THRESHOLD = 0.74;

/**
 * Extrai o descritor v3 focado no núcleo do objeto a partir dos pixels YCbCr reais do JPEG
 * (com fallback determinístico para buffers sintéticos de testes unitários).
 */
function extractV3Features(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 64) {
    return {
      patchY: new Array(PATCH_CELLS).fill(128),
      patchCb: new Array(PATCH_CELLS).fill(0),
      patchCr: new Array(PATCH_CELLS).fill(0),
      patchEdge: new Array(PATCH_CELLS).fill(0),
      hist: new Array(HIST_BINS).fill(0),
      dHash: '0000000000000000',
    };
  }

  const decodedJpeg = decodeJpegDcGrid(bytes);
  if (decodedJpeg) {
    const { mcuCols, mcuRows, outGridY, outGridCb, outGridCr } = decodedJpeg;
    const x0 = Math.floor(mcuCols * 0.25);
    const x1 = Math.max(x0 + PATCH_SIDE, Math.floor(mcuCols * 0.75));
    const y0 = Math.floor(mcuRows * 0.22);
    const y1 = Math.max(y0 + PATCH_SIDE, Math.floor(mcuRows * 0.78));
    const w = x1 - x0;
    const h = y1 - y0;

    const patchY = new Array(PATCH_CELLS);
    const patchCb = new Array(PATCH_CELLS);
    const patchCr = new Array(PATCH_CELLS);
    const patchEdge = new Array(PATCH_CELLS);

    for (let gy = 0; gy < PATCH_SIDE; gy += 1) {
      const sy0 = y0 + Math.floor((gy * h) / PATCH_SIDE);
      const sy1 = Math.max(
        sy0 + 1,
        y0 + Math.floor(((gy + 1) * h) / PATCH_SIDE)
      );
      for (let gx = 0; gx < PATCH_SIDE; gx += 1) {
        const sx0 = x0 + Math.floor((gx * w) / PATCH_SIDE);
        const sx1 = Math.max(
          sx0 + 1,
          x0 + Math.floor(((gx + 1) * w) / PATCH_SIDE)
        );
        let sumY = 0;
        let sumCb = 0;
        let sumCr = 0;
        let sumEdge = 0;
        let cnt = 0;

        for (let y = sy0; y < sy1; y += 1) {
          const rOff = y * mcuCols;
          const rNext = Math.min(mcuRows - 1, y + 1) * mcuCols;
          for (let x = sx0; x < sx1; x += 1) {
            const yv = outGridY[rOff + x];
            const xNext = Math.min(mcuCols - 1, x + 1);
            const edge =
              Math.abs(yv - outGridY[rOff + xNext]) +
              Math.abs(yv - outGridY[rNext + x]);
            sumY += yv;
            sumCb += outGridCb[rOff + x] - 128;
            sumCr += outGridCr[rOff + x] - 128;
            sumEdge += edge;
            cnt += 1;
          }
        }

        const idx = gy * PATCH_SIDE + gx;
        patchY[idx] = Number((sumY / (cnt || 1)).toFixed(2));
        patchCb[idx] = Number((sumCb / (cnt || 1)).toFixed(2));
        patchCr[idx] = Number((sumCr / (cnt || 1)).toFixed(2));
        patchEdge[idx] = Number((sumEdge / (cnt || 1)).toFixed(2));
      }
    }

    const hist = new Array(HIST_BINS).fill(0);
    for (let gy = 2; gy < 10; gy += 1) {
      for (let gx = 2; gx < 10; gx += 1) {
        const idx = gy * PATCH_SIDE + gx;
        const dx = (gx - 5.5) / 4;
        const dy = (gy - 5.5) / 4;
        const wgt = Math.exp(-0.5 * (dx * dx + dy * dy));
        const yBin = Math.min(7, Math.max(0, Math.floor((patchY[idx] / 256) * 8)));
        hist[yBin] = Number((hist[yBin] + wgt).toFixed(4));
        const cbBin = Math.min(
          3,
          Math.max(0, Math.floor(((patchCb[idx] + 40) / 80) * 4))
        );
        hist[8 + cbBin] = Number((hist[8 + cbBin] + wgt).toFixed(4));
        const crBin = Math.min(
          3,
          Math.max(0, Math.floor(((patchCr[idx] + 40) / 80) * 4))
        );
        hist[12 + crBin] = Number((hist[12 + crBin] + wgt).toFixed(4));
        const eBin = Math.min(
          3,
          Math.max(0, Math.floor((patchEdge[idx] / 40) * 4))
        );
        hist[16 + eBin] = Number((hist[16 + eBin] + wgt).toFixed(4));
      }
    }

    let dHashHex = '';
    for (let row = 2; row < 10; row += 1) {
      let byteVal = 0;
      for (let col = 2; col < 10; col += 1) {
        const cur = patchY[row * PATCH_SIDE + col];
        const next = patchY[row * PATCH_SIDE + col + 1];
        if (cur < next) {
          byteVal |= 1 << (7 - (col - 2));
        }
      }
      dHashHex += byteVal.toString(16).padStart(2, '0');
    }

    return {
      patchY,
      patchCb,
      patchCr,
      patchEdge,
      hist,
      dHash: dHashHex,
    };
  }

  // Fallback determinístico para buffers sintéticos (testes unitários sem cabeçalho JPEG 0xFFD8)
  const startOffset = Math.min(128, Math.floor(bytes.length * 0.05));
  const usableLength = Math.max(PATCH_CELLS, bytes.length - startOffset);
  const patchY = new Array(PATCH_CELLS);
  const patchCb = new Array(PATCH_CELLS);
  const patchCr = new Array(PATCH_CELLS);
  const patchEdge = new Array(PATCH_CELLS);

  const samplesPerCell = Math.max(4, Math.floor(usableLength / (PATCH_CELLS * 2)));
  for (let i = 0; i < PATCH_CELLS; i += 1) {
    const cellStart = startOffset + Math.floor((i * usableLength) / PATCH_CELLS);
    const cellSpan = Math.max(1, Math.floor(usableLength / PATCH_CELLS));
    let sum = 0;
    let edgeSum = 0;
    for (let s = 0; s < samplesPerCell; s += 1) {
      const idx = Math.min(
        bytes.length - 1,
        cellStart + Math.floor(((s + 0.5) * cellSpan) / samplesPerCell)
      );
      const nextIdx = Math.min(bytes.length - 1, idx + 1);
      sum += bytes[idx];
      edgeSum += Math.abs(bytes[idx] - bytes[nextIdx]);
    }
    const meanVal = sum / samplesPerCell;
    patchY[i] = Number(meanVal.toFixed(2));
    patchCb[i] = Number(((meanVal - 128) * 0.25).toFixed(2));
    patchCr[i] = Number(((128 - meanVal) * 0.25).toFixed(2));
    patchEdge[i] = Number((edgeSum / samplesPerCell).toFixed(2));
  }

  const hist = new Array(HIST_BINS).fill(0);
  for (let gy = 2; gy < 10; gy += 1) {
    for (let gx = 2; gx < 10; gx += 1) {
      const idx = gy * PATCH_SIDE + gx;
      const yBin = Math.min(7, Math.max(0, Math.floor((patchY[idx] / 256) * 8)));
      hist[yBin] += 1;
      const eBin = Math.min(3, Math.max(0, Math.floor((patchEdge[idx] / 40) * 4)));
      hist[16 + eBin] += 1;
    }
  }

  let dHashHex = '';
  for (let row = 2; row < 10; row += 1) {
    let byteVal = 0;
    for (let col = 2; col < 10; col += 1) {
      const cur = patchY[row * PATCH_SIDE + col];
      const next = patchY[row * PATCH_SIDE + col + 1];
      if (cur < next) {
        byteVal |= 1 << (7 - (col - 2));
      }
    }
    dHashHex += byteVal.toString(16).padStart(2, '0');
  }

  return {
    patchY,
    patchCb,
    patchCr,
    patchEdge,
    hist,
    dHash: dHashHex,
  };
}

/**
 * Gera a assinatura visual v3 serializada em JSON para armazenamento em `items.visual_signature`.
 */
export function computeVisualSignature({ base64, detections = [] } = {}) {
  const bytes = decodeBase64PayloadBytes(base64);
  const { patchY, patchCb, patchCr, patchEdge, hist, dHash } =
    extractV3Features(bytes);

  const validDetections = Array.isArray(detections)
    ? detections
        .filter((d) => d && typeof d.label === 'string')
        .sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))
    : [];

  const top = validDetections[0] || null;

  const signatureObj = {
    v: 3,
    primaryClass: top ? String(top.label).trim() : null,
    classId:
      top && Number.isFinite(Number(top.classId)) ? Number(top.classId) : null,
    grid: patchY,
    chromaCb: patchCb,
    chromaCr: patchCr,
    edge: patchEdge,
    hist,
    dHash,
  };

  return JSON.stringify(signatureObj);
}

/**
 * Faz o parse seguro de uma assinatura visual serializada (OWASP: bloqueia Prototype Pollution).
 */
export function parseVisualSignature(rawSignature) {
  if (!rawSignature) return null;
  if (typeof rawSignature === 'object') {
    if (
      rawSignature.v === 3 &&
      Array.isArray(rawSignature.grid) &&
      rawSignature.grid.length === PATCH_CELLS &&
      typeof rawSignature.dHash === 'string'
    ) {
      return rawSignature;
    }
    return null;
  }

  if (typeof rawSignature !== 'string') return null;
  const trimmed = rawSignature.trim();
  if (!trimmed || trimmed.length > MAX_SIGNATURE_JSON_BYTES) return null;
  if (
    trimmed.includes('__proto__') ||
    trimmed.includes('"constructor"') ||
    trimmed.includes('"prototype"')
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.v !== 3 ||
      !Array.isArray(parsed.grid) ||
      parsed.grid.length !== PATCH_CELLS ||
      typeof parsed.dHash !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Calcula a pontuação de similaridade v3 [0, 1] entre dois protótipos únicos
 * usando Template Matching 8x8 deslizante (dx, dy em [-2..+2]) sobre o patch 12x12
 * com ponderação Gaussiana central + similaridade de histograma do objeto.
 */
function computeSinglePrototypeSimilarity(a, b) {
  if (!a || !b || !Array.isArray(a.grid) || !Array.isArray(b.grid)) return 0;

  let bestSpatial = 0;
  const hasChromaAndEdge =
    Array.isArray(a.chromaCb) &&
    Array.isArray(b.chromaCb) &&
    Array.isArray(a.chromaCr) &&
    Array.isArray(b.chromaCr) &&
    Array.isArray(a.edge) &&
    Array.isArray(b.edge);

  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      let diffY = 0;
      let diffCb = 0;
      let diffCr = 0;
      let diffE = 0;
      let wSum = 0;

      for (let gy = 2; gy < 10; gy += 1) {
        for (let gx = 2; gx < 10; gx += 1) {
          const cx = (gx - 5.5) / 3.5;
          const cy = (gy - 5.5) / 3.5;
          const w = Math.exp(-0.6 * (cx * cx + cy * cy));
          const ia = gy * PATCH_SIDE + gx;
          const ib = (gy + dy) * PATCH_SIDE + (gx + dx);

          diffY += w * Math.abs((Number(a.grid[ia]) || 0) - (Number(b.grid[ib]) || 0));
          if (hasChromaAndEdge) {
            diffCb +=
              w *
              Math.abs(
                (Number(a.chromaCb[ia]) || 0) - (Number(b.chromaCb[ib]) || 0)
              );
            diffCr +=
              w *
              Math.abs(
                (Number(a.chromaCr[ia]) || 0) - (Number(b.chromaCr[ib]) || 0)
              );
            diffE +=
              w *
              Math.abs((Number(a.edge[ia]) || 0) - (Number(b.edge[ib]) || 0));
          }
          wSum += w;
        }
      }

      const simY = Math.max(0, 1 - diffY / (wSum || 1) / 75);
      if (hasChromaAndEdge) {
        const simChroma = Math.max(
          0,
          1 - (diffCb + diffCr) / (wSum || 1) / 28
        );
        const simEdge = Math.max(0, 1 - diffE / (wSum || 1) / 22);
        const score = simY * 0.45 + simChroma * 0.3 + simEdge * 0.25;
        if (score > bestSpatial) bestSpatial = score;
      } else if (simY > bestSpatial) {
        bestSpatial = simY;
      }
    }
  }

  let histSim = bestSpatial;
  if (
    Array.isArray(a.hist) &&
    Array.isArray(b.hist) &&
    a.hist.length === HIST_BINS &&
    b.hist.length === HIST_BINS
  ) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < HIST_BINS; i += 1) {
      const va = Number(a.hist[i]) || 0;
      const vb = Number(b.hist[i]) || 0;
      dot += va * vb;
      na += va * va;
      nb += vb * vb;
    }
    if (na > 1e-6 && nb > 1e-6) {
      histSim = dot / (Math.sqrt(na) * Math.sqrt(nb));
    }
  }

  const combined = bestSpatial * 0.65 + histSim * 0.35;
  return Number(Math.max(0, Math.min(1, combined)).toFixed(4));
}

/**
 * Calcula a pontuação de similaridade v3 [0, 1] entre duas assinaturas visuais,
 * avaliando todos os protótipos multi-ângulo armazenados (até 3 visões por item).
 */
export function computeVisualSimilarity(sigA, sigB) {
  const a = parseVisualSignature(sigA);
  const b = parseVisualSignature(sigB);
  if (!a || !b) return 0;

  const viewsA = [
    a,
    ...(Array.isArray(a.prototypes) ? a.prototypes.slice(0, 2) : []),
  ];
  const viewsB = [
    b,
    ...(Array.isArray(b.prototypes) ? b.prototypes.slice(0, 2) : []),
  ];

  let maxSim = 0;
  for (const va of viewsA) {
    for (const vb of viewsB) {
      const s = computeSinglePrototypeSimilarity(va, vb);
      if (s > maxSim) maxSim = s;
    }
  }

  return maxSim;
}

/**
 * Mescla uma nova assinatura visual v3 com a assinatura existente do item,
 * preservando até `maxExtraPrototypes` ângulos extras (total de 3 visões por item)
 * sem crescimento ilimitado de memória.
 */
export function mergeVisualSignatures(
  existingSig,
  newSig,
  maxExtraPrototypes = 2
) {
  const existing = parseVisualSignature(existingSig);
  const incoming = parseVisualSignature(newSig);
  if (!incoming && !existing) return null;
  if (!existing) return JSON.stringify(incoming);
  if (!incoming) return JSON.stringify(existing);

  const compactPrototype = {
    grid: incoming.grid,
    chromaCb: incoming.chromaCb,
    chromaCr: incoming.chromaCr,
    edge: incoming.edge,
    hist: incoming.hist,
    dHash: incoming.dHash,
  };

  const priorPrototypes = Array.isArray(existing.prototypes)
    ? existing.prototypes.filter(
        (p) => p && Array.isArray(p.grid) && p.grid.length === PATCH_CELLS
      )
    : [];

  const updatedPrototypes = [...priorPrototypes, compactPrototype].slice(
    -Math.max(1, maxExtraPrototypes)
  );

  return JSON.stringify({
    ...existing,
    prototypes: updatedPrototypes,
  });
}

/**
 * Procura no inventário o item já cadastrado cuja assinatura visual v3 mais se aproxima
 * da foto recém-capturada acima do limiar de confiança (0.74) e com margem de distinção segura.
 */
export function findBestVisualMatch(
  candidateSignature,
  items = [],
  { threshold = DEFAULT_MATCH_THRESHOLD, minMargin = 0.04 } = {}
) {
  const candidateParsed = parseVisualSignature(candidateSignature);
  if (!candidateParsed || !Array.isArray(items) || items.length === 0) {
    return null;
  }

  const scored = [];
  for (const item of items) {
    if (!item || !item.visual_signature) continue;
    const similarity = computeVisualSimilarity(
      candidateParsed,
      item.visual_signature
    );
    scored.push({ item, similarity });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.similarity - a.similarity);

  const best = scored[0];
  if (best.similarity < threshold) {
    return null;
  }

  // Garante margem mínima sobre o segundo colocado de nome diferente para evitar falso reconhecimento
  const bestNameKey = String(best.item.name ?? '')
    .trim()
    .toLowerCase();
  const secondDifferent = scored.find(
    (entry) =>
      String(entry.item.name ?? '')
        .trim()
        .toLowerCase() !== bestNameKey
  );

  if (
    secondDifferent &&
    best.similarity < 0.88 &&
    best.similarity - secondDifferent.similarity < minMargin
  ) {
    return null;
  }

  return {
    item: best.item,
    similarity: best.similarity,
    confidencePercent: Math.round(best.similarity * 100),
  };
}
