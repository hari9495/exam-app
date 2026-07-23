'use client';

import { useId } from 'react';
import { scaleLinear, scalePoint } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';

export interface SparklinePoint {
  date: string;
  value: number;
}

interface SparklineProps {
  data: SparklinePoint[];
  color: string;
}

const WIDTH = 200;
const HEIGHT = 48;

export function Sparkline({ data, color }: SparklineProps) {
  const gradientId = useId();

  if (data.length === 0) {
    return <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full" role="img" aria-label="No trend data" />;
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

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Trend sparkline">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}
