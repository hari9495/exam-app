'use client';

import { useEffect, useRef, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';

export interface GroupedBarSeries {
  key: string;
  value: number;
  color: string;
}

export interface GroupedBarGroup {
  label: string;
  series: GroupedBarSeries[];
}

interface GroupedBarChartProps {
  groups: GroupedBarGroup[];
}

const DEFAULT_WIDTH = 600;
const HEIGHT = 260;
const MARGIN = { top: 24, right: 16, bottom: 32, left: 16 };
const LABEL_MAX_CHARS = 20;

function useContainerWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (measured && measured > 0) setWidth(measured);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

export function GroupedBarChart({ groups }: GroupedBarChartProps) {
  const [containerRef, width] = useContainerWidth(DEFAULT_WIDTH);

  if (groups.length === 0) {
    return (
      <div ref={containerRef} className="h-full w-full">
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="block h-full w-full" role="img" aria-label="No exam performance data" />
      </div>
    );
  }

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const outerScale = scaleBand()
    .domain(groups.map((group) => group.label))
    .range([0, innerWidth])
    .padding(0.3);

  const seriesKeys = groups[0].series.map((series) => series.key);
  const innerScale = scaleBand()
    .domain(seriesKeys)
    .range([0, outerScale.bandwidth()])
    .padding(0.15);

  const valueScale = scaleLinear().domain([0, 100]).range([innerHeight, 0]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="block h-full w-full" role="img" aria-label="Exam performance chart">
        <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
          {groups.map((group) => (
            <g key={group.label} transform={`translate(${outerScale(group.label) ?? 0}, 0)`}>
              <title>{group.label}</title>
              {group.series.map((series) => {
                const barX = innerScale(series.key) ?? 0;
                const barWidth = innerScale.bandwidth();
                const barY = valueScale(series.value);
                const barHeight = innerHeight - barY;
                return (
                  <g key={series.key}>
                    <rect x={barX} y={barY} width={barWidth} height={barHeight} fill={series.color} rx={2} />
                    <text x={barX + barWidth / 2} y={barY - 4} textAnchor="middle" fontSize={10} fill="#334155">
                      {series.value}
                    </text>
                  </g>
                );
              })}
              <text x={outerScale.bandwidth() / 2} y={innerHeight + 16} textAnchor="middle" fontSize={11} fill="#334155">
                {group.label.length > LABEL_MAX_CHARS ? `${group.label.slice(0, LABEL_MAX_CHARS)}…` : group.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
