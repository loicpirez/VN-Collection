import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DonutChart, HBarChart, VBarChart } from '@/components/charts/BarChart';
import { DEFAULT_PALETTE, PriceHistoryChart } from '@/components/charts/Sparkline';

interface ChildrenProps {
  children?: ReactNode;
}

interface AxisProps {
  tickFormatter: (value: number) => string;
}

interface TooltipProps {
  labelFormatter: (value: number | string | null) => string;
  formatter: (value: number | string, name: string) => [string, string];
}

interface ReferenceLineProps {
  y: number;
  stroke: string;
  label: { value: string; fill: string };
}

interface LineProps {
  dataKey: string;
  stroke: string;
}

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: ChildrenProps) => <div data-recharts="responsive">{children}</div>,
  LineChart: ({ children, data }: ChildrenProps & { data: Array<Record<string, number | null>> }) => (
    <div data-recharts="line-chart" data-rows={JSON.stringify(data)}>{children}</div>
  ),
  CartesianGrid: () => <span data-recharts="grid" />,
  Legend: () => <span data-recharts="legend" />,
  Line: ({ dataKey, stroke }: LineProps) => <span data-recharts="line" data-key={dataKey} data-stroke={stroke} />,
  ReferenceLine: ({ y, stroke, label }: ReferenceLineProps) => (
    <span data-recharts="guide" data-y={y} data-stroke={stroke} data-label={label.value} data-label-fill={label.fill} />
  ),
  XAxis: ({ tickFormatter }: AxisProps) => <span data-recharts="x-axis">{tickFormatter(Date.UTC(2026, 0, 2))}</span>,
  YAxis: ({ tickFormatter }: AxisProps) => <span data-recharts="y-axis">{tickFormatter(1234)}</span>,
  Tooltip: ({ labelFormatter, formatter }: TooltipProps) => (
    <span data-recharts="tooltip">
      {labelFormatter(Date.UTC(2026, 0, 2))}
      {labelFormatter('raw')}
      {labelFormatter(null)}
      {formatter(1234, 'Series')[0]}
      {formatter('raw', 'Series')[0]}
    </span>
  ),
}));

describe('bar chart primitives', () => {
  it('renders horizontal empty states, linked rows, plain rows, sublabels, and custom formatting', () => {
    expect(renderToStaticMarkup(<HBarChart data={[]} locale="en" />)).toBe('');
    expect(renderToStaticMarkup(<HBarChart data={[]} locale="en" emptyMessage="Nothing" />)).toContain('Nothing');

    const html = renderToStaticMarkup(
      <HBarChart
        locale="en"
        maxWidthPct={80}
        barClassName="bg-custom"
        formatValue={(value) => `${value} items`}
        data={[
          { label: 'Linked', value: 4, href: '/linked', sublabel: 'sub' },
          { label: 'Plain', value: 0 },
        ]}
      />,
    );

    expect(html).toContain('href="/linked"');
    expect(html).toContain('width:80%');
    expect(html).toContain('width:0%');
    expect(html).toContain('bg-custom');
    expect(html).toContain('4 items');
    expect(html).toContain('sub');
    expect(renderToStaticMarkup(<HBarChart locale="en" data={[{ label: 'Default', value: 4 }]} />)).toContain('>4</span>');
  });

  it('renders vertical empty states, linked and plain bars, zero values, and tooltips', () => {
    expect(renderToStaticMarkup(<VBarChart data={[]} locale="en" />)).toBe('');
    expect(renderToStaticMarkup(<VBarChart data={[]} locale="en" emptyMessage="Nothing" />)).toContain('Nothing');

    const html = renderToStaticMarkup(
      <VBarChart
        locale="en"
        height={100}
        barClassName="bg-custom"
        formatValue={(value) => `${value} vns`}
        data={[
          { label: 'Linked', value: 2, href: '/linked', tooltip: 'Custom tooltip' },
          { label: 'Plain', value: 0 },
        ]}
      />,
    );

    expect(html).toContain('href="/linked"');
    expect(html).toContain('aria-label="Custom tooltip"');
    expect(html).toContain('title="Plain / 0 vns"');
    expect(html).toContain('height:100px');
    expect(html).toContain('height:0px');
    expect(html).toContain('opacity-30');
    expect(html).toContain('cursor-pointer');
    expect(renderToStaticMarkup(<VBarChart locale="en" data={[{ label: 'Default', value: 1 }]} />)).toContain('Default / 1');
  });

  it('renders donut zero state plus linked and plain legend slices with custom dimensions', () => {
    expect(renderToStaticMarkup(<DonutChart data={[]} />)).toBe('');

    const html = renderToStaticMarkup(
      <DonutChart
        size={160}
        thickness={20}
        data={[
          { label: 'Linked', value: 2, color: '#fff', href: '/linked' },
          { label: 'Plain', value: 1, color: '#000' },
        ]}
      />,
    );

    expect(html).toContain('aria-label="Linked: 2, Plain: 1"');
    expect(html).toContain('width="160"');
    expect(html).toContain('stroke-width="20"');
    expect(html).toContain('href="/linked"');
    expect(html).toContain('>3</text>');
  });
});

describe('price history chart adapter', () => {
  it('renders the accessible empty state when every series is empty', () => {
    const html = renderToStaticMarkup(
      <PriceHistoryChart ariaLabel="History" locale="en" series={[{ label: 'Empty', points: [] }]} />,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="History"');
    expect(html).toContain('>-</div>');
  });

  it('builds sparse sorted rows and renders default palette, custom colors, guides, tooltip formatters, and legend', () => {
    const html = renderToStaticMarkup(
      <PriceHistoryChart
        ariaLabel="History"
        locale="en"
        height={260}
        guides={[
          { y: 900, label: 'Default guide' },
          { y: 800, label: 'Custom guide', color: '#123456' },
        ]}
        series={[
          { label: 'Default', points: [{ x: 2, y: 200 }, { x: 1, y: 100 }] },
          { label: 'Custom', color: '#abcdef', points: [{ x: 2, y: 300 }] },
        ]}
      />,
    );

    expect(html).toContain('data-recharts="legend"');
    expect(html).toContain('data-rows="[{&quot;x&quot;:1,&quot;Default&quot;:100,&quot;Custom&quot;:null},{&quot;x&quot;:2,&quot;Default&quot;:200,&quot;Custom&quot;:300}]"');
    expect(html).toContain(`data-stroke="${DEFAULT_PALETTE[0]}"`);
    expect(html).toContain('data-stroke="#abcdef"');
    expect(html).toContain('data-stroke="rgb(248, 113, 113)"');
    expect(html).toContain('data-stroke="#123456"');
    expect(html).toContain('data-recharts="x-axis"');
    expect(html).toContain('data-recharts="y-axis"');
    expect(html).toContain('data-recharts="tooltip"');
  });

  it('supports custom currency formatting, hidden legends, and palette wraparound', () => {
    const series = Array.from({ length: DEFAULT_PALETTE.length + 1 }, (_, index) => ({
      label: `Series ${index}`,
      points: [{ x: index, y: index + 1 }],
    }));
    const html = renderToStaticMarkup(
      <PriceHistoryChart
        ariaLabel="History"
        locale="ja"
        hideLegend
        formatYen={(value) => `${value} yen`}
        series={series}
      />,
    );

    expect(html).not.toContain('data-recharts="legend"');
    expect(html).toContain('1234 yen');
    expect(html.split(`data-stroke="${DEFAULT_PALETTE[0]}"`).length - 1).toBe(2);
  });
});
