import { useMemo, useState, useRef, useCallback } from 'react';
import {
  FiringCurveResult,
  FiringProgram,
} from '../firingCurve/types';
import { ortonTempFor } from '../firingCurve/orton';

const VIEW_W = 800;
const VIEW_H = 400;
const PAD = { top: 24, right: 24, bottom: 44, left: 56 };

interface AxisRange {
  timeMin: number;
  timeMax: number;
  tempMin: number;
  tempMax: number;
}

interface ChartPoint {
  timeMin: number;
  temp: number;
  segmentIndex: number;
  isHold: boolean;
}

interface Props {
  program: FiringProgram;
  result: FiringCurveResult;
}

export default function FiringCurveChart({ program, result }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<ChartPoint | null>(null);

  const { ok, segments, metrics } = result;

  const range: AxisRange | null = useMemo(() => {
    if (!ok || segments.length === 0) return null;
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
  }, [ok, segments, program.initialTemp, program.cone, program.ortonRate]);

  const timeToX = useCallback(
    (hours: number) => {
      const r = range!;
      const hoursArr = [r.timeMin / 60, r.timeMax / 60];
      const t = hours;
      return PAD.left + ((t - hoursArr[0]) / (hoursArr[1] - hoursArr[0])) * (VIEW_W - PAD.left - PAD.right);
    },
    [range],
  );

  const tempToY = useCallback(
    (temp: number) => {
      const r = range!;
      return PAD.top + ((r.tempMax - temp) / (r.tempMax - r.tempMin)) * (VIEW_H - PAD.top - PAD.bottom);
    },
    [range],
  );

  const points: { pts: ChartPoint[]; path: string; holds: { x1: number; x2: number; y: number; seg: number }[]; markers: { x: number; y: number; seg: number; isHold: boolean }[] } =
    useMemo(() => {
      if (!ok || !range || segments.length === 0) {
        return { pts: [], path: '', holds: [], markers: [] };
      }
      const pts: ChartPoint[] = [];
      let dotted = '';
      const dParts: string[] = [];
      const holds: { x1: number; x2: number; y: number; seg: number }[] = [];
      const markers: { x: number; y: number; seg: number; isHold: boolean }[] = [];

      // Punto de inicio
      pts.push({ timeMin: 0, temp: program.initialTemp, segmentIndex: -1, isHold: false });
      markers.push({ x: timeToX(0), y: tempToY(program.initialTemp), seg: -1, isHold: false });

      let sampled: ChartPoint[] = [];
      segments.forEach((s, i) => {
        const startTimer = s.startTimeMin;
        if (s.type === 'ramp') {
          const steps = Math.max(20, Math.ceil(s.durationMin / 2));
          const dDir = s.direction === 'down' ? -1 : 1;
          for (let k = 0; k <= steps; k++) {
            const frac = k / steps;
            const t = startTimer + s.durationMin * frac;
            const temp = s.startTemp + dDir * (Math.abs(s.endTemp - s.startTemp) * frac);
            sampled.push({ timeMin: t, temp, segmentIndex: i, isHold: false });
          }
          // marca de cambio de segmento al final
          markers.push({ x: timeToX(s.endTimeMin / 60), y: tempToY(s.endTemp), seg: i, isHold: false });
        } else {
          // meseta: mantiene la temperatura heredada
          const x1 = timeToX(s.startTimeMin / 60);
          const x2 = timeToX(s.endTimeMin / 60);
          const y = tempToY(s.endTemp);
          holds.push({ x1, x2, y, seg: i });
          markers.push({ x: x2, y, seg: i, isHold: true });
          sampled.push({ timeMin: s.startTimeMin, temp: s.endTemp, segmentIndex: i, isHold: true });
          sampled.push({ timeMin: s.endTimeMin, temp: s.endTemp, segmentIndex: i, isHold: true });
        }
      });

      if (sampled.length === 0) return { pts: [], path: '', holds: [], markers };

      sampled = sampled.sort((a, b) => a.timeMin - b.timeMin);
      // dedupe seguidas
      const cleaned: ChartPoint[] = [];
      for (const p of sampled) {
        const last = cleaned[cleaned.length - 1];
        if (!last || Math.abs(last.timeMin - p.timeMin) > 1e-6 || Math.abs(last.temp - p.temp) > 1e-6) {
          cleaned.push(p);
        }
      }

      dParts.push(`M ${timeToX(cleaned[0].timeMin / 60).toFixed(2)} ${tempToY(cleaned[0].temp).toFixed(2)}`);
      for (let k = 1; k < cleaned.length; k++) {
        dParts.push(`L ${timeToX(cleaned[k].timeMin / 60).toFixed(2)} ${tempToY(cleaned[k].temp).toFixed(2)}`);
      }
      if (cleaned.length > 0) {
        // cerrar marca de inicio
        const startX = timeToX(0);
        const startY = tempToY(program.initialTemp);
        markers[0] = { x: startX, y: startY, seg: -1, isHold: false };
      }

      return { pts: cleaned, path: dParts.join(' '), holds, markers };
    }, [ok, range, segments, program.initialTemp, timeToX, tempToY]);

  if (!ok || !range || segments.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-[#E4E4E2] bg-white/60 text-sm text-[#B2BEC3]">
        No hay un programa válido para dibujar.
      </div>
    );
  }

  // gridlines
  const yTicks = buildTicks(range.tempMin, range.tempMax, 6);
  const xTicks = buildTicks(range.timeMin / 60, range.timeMax / 60, 6);

  const coneTemp = program.cone ? ortonTempFor(program.cone, program.ortonRate) : null;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const sy = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    // find closest point
    const candidates = points.pts.map((p) => ({
      p,
      d: Math.hypot(timeToX(p.timeMin / 60) - sx, tempToY(p.temp) - sy),
    }));
    candidates.sort((a, b) => a.d - b.d);
    if (candidates[0] && candidates[0].d < 30) {
      setHover(candidates[0].p);
    } else {
      setHover(null);
    }
  };

  const hoverSeg =
    hover && hover.segmentIndex >= 0 ? segments[hover.segmentIndex] : undefined;

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full touch-none select-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Gráfica de la curva de cocción ${program.name}`}
      >
        {/* zona de inversión del cuarzo */}
        <rect
          x={PAD.left}
          y={tempToY(600)}
          width={VIEW_W - PAD.left - PAD.right}
          height={tempToY(540) - tempToY(600)}
          fill="#fde68a"
          opacity={0.25}
        />

        {/* grid horizontales */}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={tempToY(t)}
              y2={tempToY(t)}
              stroke="#E4E4E2"
              strokeWidth={1}
            />
            <text x={PAD.left - 8} y={tempToY(t) + 4} textAnchor="end" fontSize={11} fill="#85929E">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {/* grid verticales */}
        {xTicks.map((t) => (
          <g key={`x-${t}`}>
            <line
              x1={timeToX(t)}
              x2={timeToX(t)}
              y1={PAD.top}
              y2={VIEW_H - PAD.bottom}
              stroke="#E4E4E2"
              strokeWidth={1}
            />
            <text x={timeToX(t)} y={VIEW_H - PAD.bottom + 16} textAnchor="middle" fontSize={11} fill="#85929E">
              {Math.round(t)}
            </text>
          </g>
        ))}

        {/* línea de cono Orton */}
        {coneTemp !== null && coneTemp >= range.tempMin && coneTemp <= range.tempMax && (
          <line
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={tempToY(coneTemp)}
            y2={tempToY(coneTemp)}
            stroke="#8a168a"
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
        )}

        {/* mesetas como tramos resaltados */}
        {points.holds.map((h, i) => (
          <line
            key={`hold-${i}`}
            x1={h.x1}
            x2={h.x2}
            y1={h.y}
            y2={h.y}
            stroke="#e67e22"
            strokeWidth={4}
            strokeLinecap="round"
          />
        ))}

        {/* curva principal */}
        <path
          d={points.path}
          fill="none"
          stroke="#2D3436"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* marcador de inicio */}
        <circle cx={timeToX(0)} cy={tempToY(program.initialTemp)} r={4.5} fill="#27ae60" stroke="#fff" strokeWidth={1.5} />
        <text x={timeToX(0) - 2} y={tempToY(program.initialTemp) - 8} textAnchor="end" fontSize={10} fill="#27ae60">
          Inicio {Math.round(program.initialTemp)}°C
        </text>

        {/* marcadores de cambio de segmento */}
        {points.markers.map((m, i) =>
          m.seg === -1 ? null : (
            <circle
              key={`m-${i}`}
              cx={m.x}
              cy={m.y}
              r={3.5}
              fill={m.isHold ? '#e67e22' : '#8a168a'}
              stroke="#fff"
              strokeWidth={1}
            />
          ),
        )}

        {/* etiquetas de ejes */}
        <text x={(PAD.left + VIEW_W - PAD.right) / 2} y={VIEW_H - 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="#636E72">
          Tiempo (h)
        </text>
        <text x={14} y={(PAD.top + VIEW_H - PAD.bottom) / 2} textAnchor="middle" fontSize={12} fontWeight={600} fill="#636E72" transform={`rotate(-90 14 ${(PAD.top + VIEW_H - PAD.bottom) / 2})`}>
          °C
        </text>

        {/* tooltip */}
        {hover && (
          <g transform={`translate(${timeToX(hover.timeMin / 60)} ${tempToY(hover.temp)})`}>
            <circle r={5} fill="#2D3436" />
            <rect x={-70} y={-52} width={150} height={42} rx={8} fill="#2D3436" />
            <text x={5} y={-36} fill="#fff" fontSize={11} fontWeight={600}>
              {hoverSeg ? `Seg. ${hoverSeg.index + 1} · ${hoverSeg.type === 'hold' ? 'Meseta' : 'Rampa'}` : 'Inicio'}
            </text>
            <text x={5} y={-20} fill="#cbd5e1" fontSize={10}>
              t={formatH(hover.timeMin)} · {Math.round(hover.temp)} °C
            </text>
          </g>
        )}
      </svg>

      {/* leyenda */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#636E72]">
        <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded bg-[#2D3436]" /> Programa</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded bg-[#e67e22]" /> Meseta</span>
        {coneTemp !== null && (
          <span className="flex items-center gap-1.5"><span className="h-0 w-5 border-t-2 border-dashed border-[#8a168a]" /> Cono {program.cone} ≈ {coneTemp} °C</span>
        )}
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#fde68a] opacity-60" /> Inversión cuarzo</span>
      </div>

      {metrics.segmentCount === 0 && (
        <p className="mt-2 text-xs text-[#B2BEC3]">Programa sin segmentos calculables.</p>
      )}
    </div>
  );
}

function formatH(timeMin: number): string {
  const h = timeMin / 60;
  return `${h.toFixed(1)} h`;
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
