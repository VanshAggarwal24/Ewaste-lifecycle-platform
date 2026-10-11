import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from 'recharts';
import type { CategoryMixRow, MaterialRecoveryRow, MonthlyPoint } from '@/api/types';
import { MATERIAL_LABELS } from '@/lib/domain';
import { EmptyState, Spinner } from '@/components/ui';
import { formatKg, humanize, monthLabel } from '@/lib/format';

/**
 * Chart wrappers around Recharts.
 *
 * Every series is fed from the API's aggregates (GROUP BY queries on the server), so a chart
 * can never show a figure the database does not contain. When a dataset is empty the chart
 * is replaced by an explicit empty state instead of a misleading flat line.
 */

const AXIS_PROPS = {
  stroke: '#94a3b8',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

const CHART_COLORS = ['#127d56', '#1f9b6c', '#43b787', '#74d1a8', '#c69d66', '#a06d3c', '#0f6347', '#94a3b8'];

function LoadingChart() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export function MonthlyTrendChart({ data, loading = false }: { data: MonthlyPoint[]; loading?: boolean }) {
  if (loading) return <LoadingChart />;

  const hasData = data?.some((point) => point.submissions || point.collected || point.recovered);
  if (!data?.length || !hasData) {
    return (
      <EmptyState
        title="No activity in this period"
        description="Monthly submissions, collections and recoveries appear once records exist."
      />
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="submissionsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#74d1a8" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#74d1a8" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...AXIS_PROPS} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <Tooltip
            labelFormatter={(label) => monthLabel(String(label))}
            contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="submissions"
            name="Items submitted"
            stroke="#127d56"
            strokeWidth={2}
            fill="url(#submissionsFill)"
          />
          <Line type="monotone" dataKey="collected" name="Items collected" stroke="#a06d3c" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="recovered" name="Items recycled" stroke="#4f46e5" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryMixChart({ data, loading = false }: { data: CategoryMixRow[]; loading?: boolean }) {
  if (loading) return <LoadingChart />;

  const rows = (data ?? []).filter((row) => row.count > 0);
  if (rows.length === 0) {
    return <EmptyState title="No items yet" description="Category distribution appears once items are submitted." />;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows}
            dataKey="count"
            nameKey="name"
            innerRadius="52%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="#fff"
          >
            {rows.map((row, index) => (
              <Cell key={row.categoryId} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MaterialRecoveryChart({ data, loading = false }: { data: MaterialRecoveryRow[]; loading?: boolean }) {
  if (loading) return <LoadingChart />;

  if (!data?.length) {
    return (
      <EmptyState
        title="No recovered material recorded"
        description="Recyclers record recovered quantities per batch; they are aggregated here by material."
      />
    );
  }

  const rows = data.map((row) => ({ ...row, label: MATERIAL_LABELS[row.materialType] ?? humanize(row.materialType) }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" tickFormatter={(value) => `${value} kg`} {...AXIS_PROPS} />
          <YAxis type="category" dataKey="label" width={130} {...AXIS_PROPS} />
          <Tooltip
            formatter={(value) => formatKg(Number(value))}
            contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
          />
          <Bar dataKey="quantityKg" name="Recovered" fill="#127d56" radius={[0, 6, 6, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Small horizontal bar chart for any `{ count, label }` breakdown (statuses, categories). */
export function BreakdownChart({
  data,
  color = '#1f9b6c',
  unit = '',
}: {
  data: { label: string; count: number }[];
  color?: string;
  unit?: string;
}) {
  if (!data?.length) {
    return <EmptyState title="Nothing to show yet" />;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval={0} angle={-18} textAnchor="end" height={56} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <Tooltip
            formatter={(value) => [`${Number(value)}${unit ? ` ${unit}` : ''}`, 'Count']}
            contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
          />
          <Bar dataKey="count" fill={color} radius={[6, 6, 0, 0]} barSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two-series comparison used on the analytics page (e.g. received vs recovered weight). */
export function DualBarChart({
  data,
  seriesA,
  seriesB,
  labelKey,
}: {
  data: Record<string, unknown>[];
  seriesA: { key: string; name: string; color: string };
  seriesB: { key: string; name: string; color: string };
  labelKey: string;
}) {
  if (!data?.length) return <EmptyState title="No data for this period" />;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey={labelKey} {...AXIS_PROPS} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey={seriesA.key} name={seriesA.name} fill={seriesA.color} radius={[6, 6, 0, 0]} barSize={18} />
          <Bar dataKey={seriesB.key} name={seriesB.name} fill={seriesB.color} radius={[6, 6, 0, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
