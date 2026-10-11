import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { pickupApi } from '@/api/endpoints';
import type { PickupRequest } from '@/api/types';
import { useResource } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { PICKUP_STATUS_OPTIONS } from '@/lib/domain';
import { formatDate, formatKg, formatNumber, humanize } from '@/lib/format';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Pagination,
  SelectField,
  StatusBadge,
  TableWrap,
  Td,
  TextField,
  Th,
  Tr,
  buttonClasses,
} from '@/components/ui';

/**
 * Pickup request list.
 *
 * The same screen serves every role: `GET /api/pickups` is scoped server-side (citizens see
 * their own requests, agents see assigned ones, staff see their centre, admins see all).
 */
export function PickupsPage({ title = 'Pickup requests' }: { title?: string }) {
  const { user } = useAuth();
  const isCitizen = user?.role === 'USER';

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [city, setCity] = useState('');

  const query = useMemo(
    () => ({ page, limit: 15, ...(status ? { status } : {}), ...(city.trim() ? { city: city.trim() } : {}) }),
    [page, status, city],
  );

  const fetcher = useCallback((signal: AbortSignal) => pickupApi.list(query, signal), [
    query.page,
    query.status,
    query.city,
  ]);

  const { data, loading, error, reload } = useResource(fetcher);
  const rows = data?.data ?? [];

  return (
    <>
      <PageHeader
        title={title}
        description={
          isCitizen
            ? 'Every pickup you have booked, with the agent handling it and its current stage.'
            : 'Requests visible to your role, from assignment through receipt at a collection centre.'
        }
        actions={
          isCitizen ? (
            <Link to="/items/new" className={buttonClasses('primary')}>
              <Truck className="h-4 w-4" />
              Book a pickup
            </Link>
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="Filters"
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatus('');
                setCity('');
                setPage(1);
              }}
            >
              Clear
            </Button>
          }
        />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label="Status"
            name="pickupStatus"
            value={status}
            placeholder="All statuses"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            options={PICKUP_STATUS_OPTIONS.map((value) => ({ value, label: humanize(value) }))}
          />
          <TextField
            label="City"
            name="pickupCity"
            value={city}
            onChange={(event) => {
              setCity(event.target.value);
              setPage(1);
            }}
            placeholder="Chennai"
            hint="Exact match on the request city"
          />
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Requests" subtitle={data?.meta ? `${formatNumber(data.meta.total)} records` : undefined} />

        {loading ? (
          <LoadingBlock label="Loading pickup requests…" />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No pickup requests"
            description={
              isCitizen
                ? 'Book a pickup together with your next submission and it will appear here.'
                : 'Nothing matches the current filters.'
            }
          />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Request</Th>
                  <Th>Address</Th>
                  <Th>Preferred</Th>
                  <Th>Agent</Th>
                  <Th>Items</Th>
                  <Th>Status</Th>
                  <Th align="right">Collected</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((pickup: PickupRequest) => (
                  <Tr key={pickup.id}>
                    <Td>
                      <Link to={`/pickups/${pickup.id}`} className="link font-medium">
                        {pickup.requestCode}
                      </Link>
                      <span className="block text-xs text-slate-500">{pickup.user?.fullName}</span>
                    </Td>
                    <Td>
                      <span className="text-sm">{pickup.addressLine}</span>
                      <span className="block text-xs text-slate-500">
                        {pickup.city}, {pickup.state} {pickup.pincode}
                      </span>
                    </Td>
                    <Td>
                      {formatDate(pickup.preferredDate)}
                      {pickup.timeSlot ? <span className="block text-xs text-slate-500">{pickup.timeSlot}</span> : null}
                    </Td>
                    <Td>
                      {pickup.agent ? (
                        <>
                          <span className="text-sm">{pickup.agent.user.fullName}</span>
                          <span className="block text-xs text-slate-500">{pickup.agent.user.phone ?? '—'}</span>
                        </>
                      ) : (
                        <span className="text-xs text-amber-700">Awaiting assignment</span>
                      )}
                    </Td>
                    <Td className="tabular">{pickup._count?.items ?? pickup.items?.length ?? '—'}</Td>
                    <Td>
                      <StatusBadge status={pickup.status} />
                    </Td>
                    <Td align="right" className="tabular">
                      {pickup.collectedWeightKg === null ? '—' : formatKg(pickup.collectedWeightKg)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination meta={data?.meta} onPageChange={setPage} busy={loading} />
          </>
        )}
      </Card>
    </>
  );
}
