// Gráfica estática de la curva de cocción en SVG (misma geometría que
// FiringCurveChart, sin interacción). Se usa para incrustar la curva como
// imagen en la ficha pública y en el PDF generado.

import { FiringProgram, FiringCurveResult } from './types';
import { ortonTempFor } from './orton';

const VIEW_W = 800;
const VIEW_H = 400;
const PAD = { top: 24, right: 24, bottom: 44, left: 56 };

interface AxisRange {
  timeMin: number;
  timeMax: number;
  tempMin: number;
  tempMax: number;
}

function buildTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const rawStep = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let step: number;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  step *= mag;
  const ticks: number[] = [];
  let v = Math.ceil(min / step) * step;
  while (v <= max + 1e-6) {
    ticks.push(v);
    v += step;
  }
  return ticks;
}

function buildRange(program: FiringProgram, segments: FiringCurveResult['segments']): AxisRange {
  const times = [0, ...segments.map((s) => s.endTimeMin)];
  const temps = segments.flatMap((s) => [s.startTemp, s.endTemp]);
  temps.push(program.initialTemp);
  if (program.cone) {
    const t = ortonTempFor(program.cone, program.ortonRate);
    if (t !== null) temps.push(t);
  }
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const minTmp = Math.min(...temps);
  const maxTmp = Math.max(...temps);
  const timePad = (maxT - minT) * 0.05 || 10;
  const tempPad = (maxTmp - minTmp) * 0.1 || 20;
  return {
    timeMin: Math.max(0, minT - timePad),
    timeMax: maxT + timePad,
    tempMin: Math.max(0, Math.floor(minTmp - tempPad)),
    tempMax: Math.ceil(maxTmp + tempPad),
  };
}

const f2 = (n: number): string => n.toFixed(2);

/**
 * Genera el markup SVG de la curva (estática) para un programa y su resultado.
 * Devuelve cadena vacía si no hay programa dibujable.
 */
export function buildCurveSvg(program: FiringProgram, result: FiringCurveResult): string {
  const { ok, segments } = result;
  if (!ok || !segments || segments.length === 0) return '';

  const range = buildRange(program, segments);
  const timeSpanH = range.timeMax / 60 - range.timeMin / 60;
  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = VIEW_H - PAD.top - PAD.bottom;
  const dx = (hours: number) =>
    PAD.left + ((hours - range.timeMin / 60) / timeSpanH) * plotW;
  const dy = (temp: number) =>
    PAD.top + ((range.tempMax - temp) / (range.tempMax - range.tempMin)) * plotH;

  // Puntos muestreados (igual que la gráfica interactiva).
  interface Pt {
    t: number;
    temp: number;
  }
  const pts: Pt[] = [];
  const holds: { x1: number; x2: number; y: number }[] = [];
  const markers: { x: number; y: number; hold: boolean }[] = [];
  markers.push({ x: dx(0), y: dy(program.initialTemp), hold: false });

  segments.forEach((s) => {
    if (s.type === 'ramp') {
      const steps = Math.max(20, Math.ceil(s.durationMin / 2));
      const dDir = s.direction === 'down' ? -1 : 1;
      for (let k = 0; k <= steps; k++) {
        const frac = k / steps;
        pts.push({
          t: s.startTimeMin + s.durationMin * frac,
          temp: s.startTemp + dDir * (Math.abs(s.endTemp - s.startTemp) * frac),
        });
      }
      markers.push({ x: dx(s.endTimeMin / 60), y: dy(s.endTemp), hold: false });
    } else {
      holds.push({ x1: dx(s.startTimeMin / 60), x2: dx(s.endTimeMin / 60), y: dy(s.endTemp) });
      markers.push({ x: dx(s.endTimeMin / 60), y: dy(s.endTemp), hold: true });
      pts.push({ t: s.startTimeMin, temp: s.endTemp });
      pts.push({ t: s.endTimeMin, temp: s.endTemp });
    }
  });

  pts.sort((a, b) => a.t - b.t);
  const cleaned: Pt[] = [];
  for (const p of pts) {
    const last = cleaned[cleaned.length - 1];
    if (!last || Math.abs(last.t - p.t) > 1e-6 || Math.abs(last.temp - p.temp) > 1e-6) {
      cleaned.push(p);
    }
  }

  const dParts: string[] = [];
  if (cleaned.length > 0) {
    dParts.push(`M ${f2(dx(cleaned[0].t / 60))} ${f2(dy(cleaned[0].temp))}`);
    for (let k = 1; k < cleaned.length; k++) {
      dParts.push(`L ${f2(dx(cleaned[k].t / 60))} ${f2(dy(cleaned[k].temp))}`);
    }
  }

  const yTicks = buildTicks(range.tempMin, range.tempMax, 6);
  const xTicks = buildTicks(range.timeMin / 60, range.timeMax / 60, 6);
  const coneTemp = program.cone ? ortonTempFor(program.cone, program.ortonRate) : null;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}" font-family="Helvetica, Arial, sans-serif">`,
  );
  // Fondo blanco (legible al incrustar como imagen en PDF/otra ficha).
  parts.push(`<rect width="${VIEW_W}" height="${VIEW_H}" fill="#ffffff" />`);
  // Zona de inversión del cuarzo.
  parts.push(
    `<rect x="${f2(dx(0))}" y="${f2(dy(600))}" width="${f2(VIEW_W - PAD.left - PAD.right)}" height="${f2(
      dy(540) - dy(600),
    )}" fill="#fde68a" opacity="0.25" />`,
  );
  // Cuadrícula horizontal + etiquetas.
  yTicks.forEach((t) => {
    parts.push(
      `<line x1="${PAD.left}" x2="${VIEW_W - PAD.right}" y1="${f2(dy(t))}" y2="${f2(dy(t))}" stroke="#E4E4E2" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${PAD.left - 8}" y="${f2(dy(t) + 4)}" text-anchor="end" font-size="11" fill="#85929E">${Math.round(t)}</text>`,
    );
  });
  // Cuadrícula vertical + etiquetas.
  xTicks.forEach((t) => {
    parts.push(
      `<line x1="${f2(dx(t))}" x2="${f2(dx(t))}" y1="${PAD.top}" y2="${VIEW_H - PAD.bottom}" stroke="#E4E4E2" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${f2(dx(t))}" y="${VIEW_H - PAD.bottom + 16}" text-anchor="middle" font-size="11" fill="#85929E">${Math.round(t)}</text>`,
    );
  });
  // Línea de cono Orton.
  if (coneTemp !== null && coneTemp >= range.tempMin && coneTemp <= range.tempMax) {
    parts.push(
      `<line x1="${PAD.left}" x2="${VIEW_W - PAD.right}" y1="${f2(dy(coneTemp))}" y2="${f2(dy(coneTemp))}" stroke="#8a168a" stroke-width="1.5" stroke-dasharray="6 4" />`,
    );
  }
  // Mesetas.
  holds.forEach((h) => {
    parts.push(
      `<line x1="${f2(h.x1)}" x2="${f2(h.x2)}" y1="${f2(h.y)}" y2="${f2(h.y)}" stroke="#e67e22" stroke-width="4" stroke-linecap="round" />`,
    );
  });
  // Curva principal.
  if (dParts.length > 0) {
    parts.push(
      `<path d="${dParts.join(' ')}" fill="none" stroke="#2D3436" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`,
    );
  }
  // Marcador de inicio.
  parts.push(
    `<circle cx="${f2(dx(0))}" cy="${f2(dy(program.initialTemp))}" r="4.5" fill="#27ae60" stroke="#ffffff" stroke-width="1.5" />`,
  );
  parts.push(
    `<text x="${f2(dx(0) - 2)}" y="${f2(dy(program.initialTemp) - 8)}" text-anchor="end" font-size="10" fill="#27ae60">Inicio ${Math.round(program.initialTemp)}°C</text>`,
  );
  // Marcadores de cambio de segmento.
  markers.forEach((m) => {
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
    parts.push(
      `<circle cx="${f2(m.x)}" cy="${f2(m.y)}" r="3.5" fill="${m.hold ? '#e67e22' : '#8a168a'}" stroke="#ffffff" stroke-width="1" />`,
    );
  });
  // Etiquetas de ejes.
  parts.push(
    `<text x="${f2((PAD.left + VIEW_W - PAD.right) / 2)}" y="${VIEW_H - 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#636E72">Tiempo (h)</text>`,
  );
  const yMid = (PAD.top + VIEW_H - PAD.bottom) / 2;
  parts.push(
    `<text x="14" y="${f2(yMid)}" text-anchor="middle" font-size="12" font-weight="600" fill="#636E72" transform="rotate(-90 14 ${f2(yMid)})">°C</text>`,
  );
  parts.push('</svg>');
  return parts.join('\n');
}

/** Rasteriza el SVG a un dataURL PNG (usado por el PDF de la ficha). */
export async function svgToPngDataUrl(svg: string, scale = 2): Promise<string> {
  const width = VIEW_W * scale;
  const height = VIEW_H * scale;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('No se pudo cargar la gráfica SVG para el PDF.'));
    i.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No hay contexto de canvas disponible.');
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, VIEW_W, VIEW_H);
  return canvas.toDataURL('image/png');
}