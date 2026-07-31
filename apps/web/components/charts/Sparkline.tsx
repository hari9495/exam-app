'use client';

import { useId, useState, type MouseEvent } from 'react';
import { scaleLinear, scalePoint } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';

export interface SparklinePoint {
  date: string;
  value: number;
}

interface SparklineProps {
  data: SparklinePoint[];
  color: string;
  unit?: string;
}

const WIDTH = 200;
const HEIGHT = 48;

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function Sparkline({ data, color, unit }: SparklineProps) {
  const gradientId = useId();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full" role="img" aria-label="No Trend Data" />;
  }

  const x = scalePoint<string>()
    .domain(data.map((point) => point.date))
    .range([0, WIDTH]);

  const maxValue = Math.max(...data.map((point) => point.value), 1);
  const y = scaleLinear().domain([0, maxValue]).range([HEIGHT - 2, 2]);

  const lineGenerator = line<SparklinePoint>()
    .x((point) => x(point.date) ?? 0)
    .y((point) => y(point.value))
    .curve(curveMonotoneX);

  const areaGenerator = area<SparklinePoint>()
    .x((point) => x(point.date) ?? 0)
    .y0(HEIGHT)
    .y1((point) => y(point.value))
    .curve(curveMonotoneX);

  const linePath = lineGenerator(data) ?? '';
  const areaPath = areaGenerator(data) ?? '';

  function handleMove(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let closestIndex = 0;
    let closestDistance = Infinity;
    data.forEach((point, index) => {
      const distance = Math.abs((x(point.date) ?? 0) - relativeX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    setHoveredIndex(closestIndex);
  }

  const hovered = hoveredIndex !== null ? data[hoveredIndex] : null;
  const hoveredX = hovered ? (x(hovered.date) ?? 0) : 0;
  const hoveredY = hovered ? y(hovered.value) : 0;

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-full w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Trend Sparkline"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} />
        {hovered && (
          <g>
            <line x1={hoveredX} y1={0} x2={hoveredX} y2={HEIGHT} stroke={color} strokeWidth={1} strokeDasharray="2,2" opacity={0.5} />
            <circle cx={hoveredX} cy={hoveredY} r={3} fill={color} stroke="white" strokeWidth={1} />
          </g>
        )}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute -top-6 z-10 whitespace-nowrap rounded bg-recruiter-text px-1.5 py-0.5 text-[10px] text-white shadow-md"
          style={{ left: `${(hoveredX / WIDTH) * 100}%`, transform: 'translateX(-50%)' }}
        >
          {formatDate(hovered.date)}: {hovered.value} {unit ?? ''}
        </div>
      )}
    </div>
  );
}
