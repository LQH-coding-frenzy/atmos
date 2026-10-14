'use client';

import type { Dashboard, UnitSystem } from '@atmos/contracts';
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
  units: UnitSystem;
};

export function ForecastTrendChart({ daily, metric, units }: ForecastTrendChartProps) {
  const chartElement = useRef<HTMLDivElement>(null);
  const trend = createForecastTrend(daily, metric, units);

  useEffect(() => {
    const element = chartElement.current;
    if (!element) return;

    const chart = echarts.init(element, undefined, { renderer: 'svg' });
    const renderChart = () => {
      const styles = getComputedStyle(element);
      const accent = styles.color;
      const muted = getComputedStyle(element.parentElement!).color;
      const ink = getComputedStyle(document.body).color;
      chart.setOption({
        animation: false,
        textStyle: { fontFamily: 'inherit' },
        grid: { top: 20, right: 14, bottom: 30, left: 48 },
        tooltip: {
          trigger: 'axis',
          confine: true,
          backgroundColor: styles.backgroundColor,
          borderColor: styles.borderTopColor,
          textStyle: { color: ink, fontSize: 12 },
          valueFormatter: (value: string | number) =>
            `${value}${trend.unit === '%' ? '%' : `°${trend.unit}`}`,
        },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: trend.labels,
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: muted, margin: 14 },
        },
        yAxis: {
          type: 'value',
          scale: metric === 'temperature',
          axisLabel: { color: muted, formatter: trend.unit === '%' ? '{value}%' : `{value}°` },
          splitNumber: 4,
          splitLine: { lineStyle: { color: styles.borderTopColor, type: 'dashed' } },
        },
        series: [
          {
            name: trend.label,
            type: 'line',
            data: trend.values,
            smooth: 0.25,
            showSymbol: true,
            symbolSize: 7,
            lineStyle: { color: accent, width: 3 },
            itemStyle: { color: accent, borderColor: styles.backgroundColor, borderWidth: 2 },
            areaStyle: { color: accent, opacity: 0.08 },
          },
        ],
      });
    };
    renderChart();

    const observer = new ResizeObserver(() => {
      if (element.clientWidth) chart.resize();
    });
    observer.observe(element);
    const themeObserver = new MutationObserver(renderChart);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    systemTheme.addEventListener('change', renderChart);
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
      systemTheme.removeEventListener('change', renderChart);
      chart.dispose();
    };
  }, [daily, metric, units]);

  return (
    <>
      <div
        className="forecast-trend-chart"
        ref={chartElement}
        role="img"
        aria-describedby="forecast-trend-description"
        aria-label={`${trend.label} chart`}
      />
      <p className="sr-only" id="forecast-trend-description">
        {trend.label}:{' '}
        {trend.labels
          .map((label, index) => `${label} ${trend.values[index]} ${trend.unit}`)
          .join(', ')}
        .
      </p>
    </>
  );
}
