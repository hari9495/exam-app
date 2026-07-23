'use client';

import { useState } from 'react';
import { scaleLinear } from 'd3-scale';

export interface FunnelStage {
  label: string;
  value: number;
}

interface FunnelChartProps {
  stages: FunnelStage[];
}

export function FunnelChart({ stages }: FunnelChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (stages.length === 0) {
    return <div />;
  }

  const maxValue = Math.max(...stages.map((stage) => stage.value), 1);
  const widthScale = scaleLinear().domain([0, maxValue]).range([0, 100]);

  return (
    <div className="flex flex-col gap-3">
      {stages.map((stage, index) => {
        const previousValue = index > 0 ? stages[index - 1].value : null;
        const dropPercent = previousValue && previousValue > 0 ? Math.round(((previousValue - stage.value) / previousValue) * 100) : null;
        const widthPercent = widthScale(stage.value);
        return (
          <div key={stage.label} className="relative">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-recruiter-text">{stage.label}</span>
              <span className="text-recruiter-text-tertiary">
                {stage.value}
                {dropPercent !== null && dropPercent > 0 && <span className="ml-1 text-status-danger">-{dropPercent}%</span>}
              </span>
            </div>
            <div
              className="h-9 rounded-md bg-[#0d9488] transition-opacity"
              style={{ width: `${widthPercent}%`, opacity: hoveredIndex === null || hoveredIndex === index ? 1 : 0.5 }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              role="img"
              aria-label={`${stage.label}: ${stage.value}`}
            >
              {hoveredIndex === index && (
                <div className="absolute -top-8 left-0 whitespace-nowrap rounded bg-recruiter-text px-2 py-1 text-xs text-white shadow-md">
                  {stage.label}: {stage.value}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
