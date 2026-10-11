import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Boxes, Package, PlusCircle, Recycle, Truck, Weight } from 'lucide-react';
import { dashboardApi } from '@/api/endpoints';
import type { AnalyticsSummary, CategoryMixRow, MonthlyPoint, Role, TimelineEvent } from '@/api/types';
import { useResource } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { CategoryMixChart, MonthlyTrendChart } from '@/components/charts/Charts';
import { Timeline } from '@/components/domain/Timeline';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  StatCard,
  StatusBadge,
  TableWrap,
  Td,
  Th,
  Tr,
  buttonClasses,
} from '@/components/ui';
import { formatDate, formatKg, formatNumber } from '@/lib/format';

interface UserDashboard {
  role: Role;
  summary: AnalyticsSummary;
  activePickups: {
    id: number;
    requestCode: string;
    status: string;
    preferredDate: string;
    timeSlot: string | null;
    city: string;
    agent: { user: { fullName: string; phone: string | null } } | null;
    _count: { items: number };
  }[];
  recentItems: {
    id: number;
    itemCode: string;
    name: string;
    status: string;
    createdAt: string;
    category: { name: string };
  }[];
  awaitingAssignment: number;
  recoveryAttributedToMyItems: { records: number; quantityKg: number };
  categoryMix: CategoryMixRow[];
  monthly: MonthlyPoint[];
  recentActivity: TimelineEvent[];
}

/**
 * Citizen landing page. Every figure comes from `GET /api/dashboard`, which is scoped to
 * the signed-in user's own records server-side.
 */
export function UserDashboardPage() {
  const { user } = useAuth();
  const fetcher = useCallback((signal: AbortSignal) => dashboardApi.get<UserDashboard>(signal), []);
  const { data, loading, error, reload } = useResource(fetcher);

  if (loading) return <LoadingBlock label="Loading your dashboard…" rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <EmptyState title="Nothing to show yet" />;

  const inProgress = data.summary.items.byStatus
    .filter((row) => !['RECYCLED', 'CANCELLED', 'REJECTED'].includes(row.status))
    .reduce((sum, row) => sum + row.count, 0);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.fullName.split(' ')[0] ?? 'there'}`}
        description="Track every device you have handed over, from the doorstep pickup to the recovered material."
        actions={
          <>
            <Link to="/items/new" className={buttonClasses('primary')}>
              <PlusCircle className="h-4 w-4" />
              Submit e-waste
            </Link>
            <Link to="/items" className={buttonClasses('secondary')}>
              My items
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Items submitted"
          value={formatNumber(data.summary.items.total)}
          hint={`${formatKg(data.summary.items.estimatedWeightKg)} declared`}
          icon={<Package className="h-5 w-5" />}
        />
        <StatCard
          label="In the pipeline"
          value={formatNumber(inProgress)}
          hint="Not yet recycled or cancelled"
          icon={<Truck className="h-5 w-5" />}
          tone="sky"
        />
        <StatCard
          label="Inspected weight"
          value={formatKg(data.summary.inspections.measuredWeightKg)}
          hint={
            data.summary.inspections.averageQualityScore === null
              ? 'No inspection yet'
              : `Avg quality score ${data.summary.inspections.averageQualityScore}/100`
          }
          icon={<Weight className="h-5 w-5" />}
          tone="clay"
        />
        <StatCard
          label="Material recovered"
          value={formatKg(data.recoveryAttributedToMyItems.quantityKg)}
          hint={`${formatNumber(data.recoveryAttributedToMyItems.records)} recovery entries`}
          icon={<Recycle className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Active pickups"
            subtitle="Requests that are still moving through collection"
            icon={<Truck className="h-4 w-4" />}
            actions={
              data.awaitingAssignment > 0 ? (
                <span className="text-xs font-medium text-amber-700">
                  {data.awaitingAssignment} awaiting an agent
                </span>
              ) : null
            }
          />
          {data.activePickups.length === 0 ? (
            <EmptyState
              title="No active pickups"
              description="Book a pickup with your next submission and it will be assigned to an eligible collection agent."
              action={
                <Link to="/items/new" className={buttonClasses('primary', 'sm')}>
                  Submit e-waste
                </Link>
              }
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Request</Th>
                  <Th>Preferred date</Th>
                  <Th>Items</Th>
                  <Th>Agent</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.activePickups.map((pickup) => (
                  <Tr key={pickup.id}>
                    <Td>
                      <Link to={`/pickups/${pickup.id}`} className="link font-medium">
                        {pickup.requestCode}
                      </Link>
                      <span className="block text-xs text-slate-500">{pickup.city}</span>
                    </Td>
                    <Td>
                      {formatDate(pickup.preferredDate)}
                      {pickup.timeSlot ? <span className="block text-xs text-slate-500">{pickup.timeSlot}</span> : null}
                    </Td>
                    <Td className="tabular">{pickup._count.items}</Td>
                    <Td>{pickup.agent?.user.fullName ?? <span className="text-slate-400">Not assigned</span>}</Td>
                    <Td>
                      <StatusBadge status={pickup.status} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="Your categories" subtitle="Share of items by category" icon={<Boxes className="h-4 w-4" />} />
          <CardBody>
            <CategoryMixChart data={data.categoryMix} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Your submissions over time" subtitle="Monthly counts from your own records" />
          <CardBody>
            <MonthlyTrendChart data={data.monthly} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Latest activity"
            subtitle="Append-only status history"
            actions={
              <Link to="/activity" className="link text-xs">
                View all
              </Link>
            }
          />
          <CardBody className="max-h-[22rem] overflow-y-auto">
            <Timeline
              events={data.recentActivity}
              emptyTitle="No activity yet"
              emptyDescription="Your lifecycle events will appear here as they happen."
            />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Recent items"
          icon={<Package className="h-4 w-4" />}
          actions={
            <Link to="/items" className={buttonClasses('secondary', 'sm')}>
              All items
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        {data.recentItems.length === 0 ? (
          <EmptyState title="You have not submitted any items yet" description="Start with a single phone or laptop." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th>Submitted</Th>
                <Th>Status</Th>
                <Th align="right">Details</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentItems.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <span className="font-medium text-slate-800">{item.name}</span>
                    <span className="block text-xs text-slate-500">{item.itemCode}</span>
                  </Td>
                  <Td>{item.category.name}</Td>
                  <Td>{formatDate(item.createdAt)}</Td>
                  <Td>
                    <StatusBadge status={item.status} />
                  </Td>
                  <Td align="right">
                    <Link to={`/items/${item.id}`} className={buttonClasses('secondary', 'sm')}>
                      Open
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={reload}>
          Refresh figures
        </Button>
      </div>
    </>
  );
}
