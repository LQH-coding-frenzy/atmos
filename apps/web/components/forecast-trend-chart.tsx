'use client';

import type { Dashboard } from '@atmos/contracts';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';
import { createForecastTrend, type ForecastTrendMetric } from '../lib/forecast-trend';

echarts.use([GridComponent, LineChart, SVGRenderer, TooltipComponent]);

type ForecastTrendChartProps = {
  daily: Dashboard['daily'];
  metric: ForecastTrendMetric;
};

export function ForecastTrendChart({ daily, metric }: ForecastTrendChartProps) {
  const chartElement = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = chartElement.current;
    if (!element) return;

    const trend = createForecastTrend(daily, metric);
    const chart = echarts.init(element, undefined, { renderer: 'svg' });
    chart.setOption({
      animation: false,
      grid: { top: 16, right: 12, bottom: 28, left: 38 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: string | number) => `${value} ${trend.unit}`,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: trend.labels,
        axisLine: { lineStyle: { color: '#59616d' } },
        axisLabel: { color: '#9da6b2' },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#9da6b2', formatter: `{value} ${trend.unit}` },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)', type: 'dashed' } },
      },
      series: [
        {
          name: trend.label,
          type: 'line',
          data: trend.values,
          smooth: true,
          showSymbol: true,
          lineStyle: { color: '#d9e4e6', width: 3 },
          itemStyle: { color: '#cde8ed', borderColor: '#282c33', borderWidth: 3 },
          areaStyle: { color: 'rgba(205, 232, 237, 0.12)' },
        },
      ],
    });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [daily, metric]);

  return (
    <div
      className="forecast-trend-chart"
      ref={chartElement}
      role="img"
      aria-label={`${metric} forecast chart`}
    />
  );
}
