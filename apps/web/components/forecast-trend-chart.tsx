'use client';

import type { Dashboard, ExtendedDailyForecast, UnitSystem } from '@atmos/contracts';
import { BarChart, LineChart } from 'echarts/charts';
import {
  AxisPointerComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GridComponent,
  MarkAreaComponent,
  MarkPointComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { useEffect, useId, useMemo, useRef } from 'react';
import {
  createForecastTrend,
  forecastTrendAvailable,
  formatForecastTrendValue,
  type ForecastTrendMetric,
  type ForecastTrendRange,
} from '../lib/forecast-trend';

echarts.use([
  AxisPointerComponent,
  BarChart,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GridComponent,
  LineChart,
  MarkAreaComponent,
  MarkPointComponent,
  SVGRenderer,
  TooltipComponent,
]);

type ForecastTrendChartProps = {
  daily: readonly ExtendedDailyForecast[];
  hourly: Dashboard['hourly'];
  metric: ForecastTrendMetric;
  range: ForecastTrendRange;
  units: UnitSystem;
  timezone: string;
};

function spans(
  points: ReturnType<typeof createForecastTrend>['points'],
  predicate: (index: number) => boolean,
  name: string,
) {
  const result: Array<Array<{ name?: string; xAxis: string }>> = [];
  let start = -1;
  for (let index = 0; index <= points.length; index++) {
    const selected = index < points.length && predicate(index);
    if (selected && start < 0) start = index;
    if (!selected && start >= 0) {
      result.push([{ name, xAxis: points[start]!.label }, { xAxis: points[index - 1]!.label }]);
      start = -1;
    }
  }
  return result;
}

export function ForecastTrendChart({
  daily,
  hourly,
  metric,
  range,
  units,
  timezone,
}: ForecastTrendChartProps) {
  const chartElement = useRef<HTMLDivElement>(null);
  const id = useId();
  const trend = useMemo(
    () => createForecastTrend(daily, metric, units, range, hourly, timezone),
    [daily, hourly, metric, range, timezone, units],
  );
  const available =
    forecastTrendAvailable(metric, range, hourly) && trend.values.some((value) => value !== null);
  const description = `${trend.label} over ${range === '12h' ? 'the next twelve hours' : range === '7d' ? 'seven days' : 'up to sixteen days'} in ${timezone}. ${trend.points.map((point) => `${point.label}: ${formatForecastTrendValue(point.value, trend)}`).join('; ')}. Missing values are not interpolated.`;

  useEffect(() => {
    const element = chartElement.current;
    if (!element || !available) return;
    let chart: echarts.EChartsType | undefined;
    const renderChart = () => {
      if (!element.clientWidth || !element.clientHeight) return;
      chart ??= echarts.init(element, undefined, { renderer: 'svg' });
      const styles = getComputedStyle(element);
      const accent = styles.color;
      const muted = getComputedStyle(element.parentElement!).color;
      const ink = getComputedStyle(document.body).color;
      const warning =
        getComputedStyle(document.body).getPropertyValue('--warning').trim() || accent;
      const highRainSpans = spans(
        trend.points,
        (index) => (trend.points[index]?.rainProbability ?? 0) >= 60,
        'High rain chance',
      );
      const nightSpans = spans(
        trend.points,
        (index) => trend.points[index]?.isDay === false,
        'Night',
      );
      const bands = range === '12h' ? nightSpans : highRainSpans;
      const firstTime = Date.parse(trend.points[0]?.time ?? '');
      const lastTime = Date.parse(trend.points.at(-1)?.time ?? '');
      const sunriseSunset =
        range === '12h'
          ? daily
              .flatMap((day) => [
                { label: 'Sunrise', time: day.sunrise },
                { label: 'Sunset', time: day.sunset },
              ])
              .filter(
                (event): event is { label: string; time: string } =>
                  !!event.time &&
                  Date.parse(event.time) >= firstTime &&
                  Date.parse(event.time) <= lastTime,
              )
              .map((event) => {
                const nearest = trend.points.reduce(
                  (best, point) =>
                    Math.abs(Date.parse(point.time) - Date.parse(event.time)) <
                    Math.abs(Date.parse(best.time) - Date.parse(event.time))
                      ? point
                      : best,
                  trend.points[0]!,
                );
                return { name: event.label, xAxis: nearest.label };
              })
          : [];
      chart.setOption(
        {
          animation: false,
          textStyle: { fontFamily: 'inherit' },
          grid: {
            top: 20,
            right: 20,
            bottom: range === '16d' ? 58 : 36,
            left: 52,
            containLabel: false,
          },
          tooltip: {
            trigger: 'axis',
            confine: true,
            axisPointer: { type: 'cross', snap: true },
            backgroundColor: styles.backgroundColor,
            borderColor: styles.borderTopColor,
            textStyle: { color: ink, fontSize: 12 },
            valueFormatter: (value: string | number) =>
              formatForecastTrendValue(typeof value === 'number' ? value : null, trend),
          },
          axisPointer: { link: [{ xAxisIndex: 'all' }], label: { backgroundColor: styles.color } },
          xAxis: {
            type: 'category',
            boundaryGap: trend.series === 'bar',
            data: trend.labels,
            axisTick: { show: false },
            axisLine: { show: false },
            axisPointer: { type: 'line' },
            axisLabel: { color: muted, margin: 12, hideOverlap: true },
          },
          yAxis: {
            type: 'value',
            scale: true,
            splitNumber: 4,
            axisLabel: {
              color: muted,
              formatter: (value: number) =>
                `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)} ${trend.unit}`,
            },
            splitLine: { lineStyle: { color: styles.borderTopColor, type: 'dashed' } },
          },
          dataZoom: [
            { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
            {
              type: 'slider',
              xAxisIndex: 0,
              show: range === '16d',
              height: 16,
              bottom: 4,
              showDetail: false,
              borderColor: 'transparent',
              backgroundColor: styles.backgroundColor,
              fillerColor: styles.color,
              handleStyle: { color: styles.color, borderColor: styles.color },
              dataBackground: {
                lineStyle: { color: muted },
                areaStyle: { color: muted, opacity: 0.12 },
              },
            },
          ],
          series: [
            {
              name: trend.label,
              type: trend.series,
              data: trend.values,
              connectNulls: false,
              smooth: trend.series === 'line' ? 0.18 : false,
              showSymbol: trend.series === 'line',
              symbolSize: range === '12h' ? 7 : 6,
              barMaxWidth: range === '12h' ? 14 : 24,
              lineStyle: { color: accent, width: 3 },
              itemStyle: { color: accent, borderColor: styles.backgroundColor, borderWidth: 2 },
              ...(trend.series === 'line' ? { areaStyle: { color: accent, opacity: 0.07 } } : {}),
              markPoint: {
                symbolSize: 32,
                itemStyle: { color: styles.backgroundColor, borderColor: accent },
                label: {
                  color: ink,
                  fontSize: 9,
                  formatter: (params: { name?: string }) => params.name ?? '',
                },
                data: [
                  { type: 'min', name: 'Min' },
                  { type: 'max', name: 'Max' },
                ],
              },
              ...(bands.length
                ? {
                    markArea: {
                      silent: true,
                      itemStyle: {
                        color: range === '12h' ? 'rgba(120,140,170,.11)' : 'rgba(225,165,80,.12)',
                      },
                      label: { show: false },
                      data: bands,
                    },
                  }
                : {}),
              ...(sunriseSunset.length
                ? {
                    markLine: {
                      symbol: ['none', 'none'],
                      silent: true,
                      lineStyle: { color: warning, type: 'dashed', width: 1 },
                      label: { color: warning, fontSize: 9, formatter: '{b}' },
                      data: sunriseSunset,
                    },
                  }
                : {}),
            },
          ],
        },
        { notMerge: true },
      );
    };
    renderChart();
    const observer = new ResizeObserver(() => {
      if (!element.clientWidth || !element.clientHeight) return;
      if (chart) chart.resize();
      else renderChart();
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
      chart?.dispose();
    };
  }, [available, daily, range, trend, timezone]);

  if (!available)
    return (
      <p className="forecast-chart-empty" role="status">
        No {trend.label.toLocaleLowerCase('en')} measurements are available for this range.
      </p>
    );
  return (
    <div className="forecast-chart-content">
      <div className="forecast-chart-summary" aria-live="polite">
        {trend.minimum === null || trend.maximum === null
          ? 'No numeric measurements available'
          : `Low ${formatForecastTrendValue(trend.minimum, trend)} · High ${formatForecastTrendValue(trend.maximum, trend)}`}
        <span>
          {trend.points.length} {range === '12h' ? 'hourly' : 'daily'} points · gaps are not
          interpolated
        </span>
      </div>
      <div
        className="forecast-trend-chart"
        ref={chartElement}
        role="img"
        aria-describedby={`${id}-description`}
        aria-label={`${trend.label}, ${range} weather chart`}
      />
      <p className="sr-only" id={`${id}-description`}>
        {description}
      </p>
      <details className="forecast-chart-data">
        <summary>Exact chart values</summary>
        <div
          className="forecast-chart-data-scroll"
          tabIndex={0}
          role="region"
          aria-label="Scrollable exact chart values"
        >
          <table>
            <caption>
              {trend.label} ({trend.unit}) · {timezone}
            </caption>
            <thead>
              <tr>
                <th scope="col">Local time</th>
                <th scope="col">
                  {trend.label} ({trend.unit})
                </th>
              </tr>
            </thead>
            <tbody>
              {trend.points.map((point) => (
                <tr key={point.time}>
                  <th scope="row">
                    <time dateTime={point.time}>{point.label}</time>
                  </th>
                  <td>{formatForecastTrendValue(point.value, trend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
