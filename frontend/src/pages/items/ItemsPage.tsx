import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, PlusCircle, Search } from 'lucide-react';
import { categoryApi, itemApi, type ItemSummaryPayload } from '@/api/endpoints';
import type { EwasteItem } from '@/api/types';
import { useDebounced, useResource } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { ITEM_STATUS_OPTIONS } from '@/lib/domain';
import { formatDate, formatKg, formatNumber, humanize } from '@/lib/format';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Pagination,
  SelectField,
  StatCard,
  StatusBadge,
  TableWrap,
  Td,
  TextField,
  Th,
  Tr,
  buttonClasses,
} from '@/components/ui';

/**
 * Item list, scoped by the API to whatever the signed-in role may see: a citizen sees their
 * own submissions, centre staff see items at their centre, administrators see everything.
 */
export function ItemsPage() {
  const { user } = useAuth();
  const isCitizen = user?.role === 'USER';

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);

  const query = useMemo(
    () => ({
      page,
      limit: 15,
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
    }),
    [page, status, categoryId],
  );

  const listFetcher = useCallback(
    (signal: AbortSignal) => itemApi.list(query, signal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.page, query.status, query.categoryId],
  );
  const categoriesFetcher = useCallback((signal: AbortSignal) => categoryApi.list({ isActive: 'true' }, signal), []);
  const summaryFetcher = useCallback((signal: AbortSignal) => itemApi.summary(signal), []);

  const { data: page_, loading, error, reload } = useResource(listFetcher);
  const { data: categories } = useResource(categoriesFetcher);
  const { data: summary } = useResource<ItemSummaryPayload>(summaryFetcher);

  const items = page_?.data ?? [];
  const visibleItems = debouncedSearch
    ? items.filter((item) =>
        `${item.name} ${item.itemCode} ${item.brand ?? ''} ${item.serialNumber ?? ''}`
          .toLowerCase()
          .includes(debouncedSearch.toLowerCase()),
      )
    : items;

  return (
    <>
      <PageHeader
        title={isCitizen ? 'My e-waste items' : 'E-waste items'}
        description={
          isCitizen
            ? 'Everything you have registered, with the live status of each device.'
            : 'Items visible to your role, with the current lifecycle stage of each record.'
        }
        actions={
          isCitizen ? (
            <Link to="/items/new" className={buttonClasses('primary')}>
              <PlusCircle className="h-4 w-4" />
              Submit e-waste
            </Link>
          ) : null
        }
      />

      {summary ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Items" value={formatNumber(summary.totalItems)} icon={<Package className="h-5 w-5" />} />
          <StatCard
            label="Inspected weight"
            value={formatKg(summary.totalInspectedWeightKg)}
            tone="clay"
            hint="Measured at the collection centre"
          />
          <StatCard
            label="Average quality"
            value={summary.averageQualityScore === null ? '—' : `${summary.averageQualityScore}/100`}
            tone="sky"
            hint="Mean inspection score"
          />
          <StatCard
            label="Top category"
            value={summary.topCategories[0]?.name ?? '—'}
            tone="amber"
            hint={summary.topCategories[0] ? `${summary.topCategories[0].count} items` : 'No items yet'}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Filters"
          subtitle="Server-side filtering — the query is executed in PostgreSQL"
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatus('');
                setCategoryId('');
                setSearch('');
                setPage(1);
              }}
            >
              Clear
            </Button>
          }
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <TextField
              label="Search this page"
              name="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, code, brand or serial"
              hint="Filters the rows already loaded"
            />
            <Search className="pointer-events-none absolute top-9 right-3 h-4 w-4 text-slate-400" aria-hidden />
          </div>

          <SelectField
            label="Status"
            name="status"
            value={status}
            placeholder="All statuses"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            options={ITEM_STATUS_OPTIONS.map((value) => ({ value, label: humanize(value) }))}
          />

          <SelectField
            label="Category"
            name="categoryId"
            value={categoryId}
            placeholder="All categories"
            onChange={(event) => {
              setCategoryId(event.target.value);
              setPage(1);
            }}
            options={(categories?.data ?? []).map((category) => ({ value: String(category.id), label: category.name }))}
          />
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Items" subtitle={page_?.meta ? `${formatNumber(page_.meta.total)} records` : undefined} />

        {loading ? (
          <LoadingBlock label="Loading items…" />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : visibleItems.length === 0 ? (
          <EmptyState
            title={debouncedSearch ? 'No items match that search' : 'No items found'}
            description={
              isCitizen
                ? 'Submit your first device to start a tracked lifecycle.'
                : 'Adjust the filters, or wait for new records to arrive.'
            }
            action={
              isCitizen ? (
                <Link to="/items/new" className={buttonClasses('primary', 'sm')}>
                  Submit e-waste
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Category</Th>
                  <Th>Owner</Th>
                  <Th>Pickup</Th>
                  <Th>Status</Th>
                  <Th align="right">Declared</Th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item: EwasteItem) => (
                  <Tr key={item.id}>
                    <Td>
                      <Link to={`/items/${item.id}`} className="link font-medium">
                        {item.name}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {item.itemCode}
                        {item.serialNumber ? ` · ${item.serialNumber}` : ''}
                      </span>
                    </Td>
                    <Td>
                      {item.category?.name ?? '—'}
                      <span className="block text-xs text-slate-500">Hazard {item.category?.hazardLevel ?? '—'}/5</span>
                    </Td>
                    <Td>{item.user?.fullName ?? `#${item.userId}`}</Td>
                    <Td>
                      {item.pickupRequest ? (
                        <Link to={`/pickups/${item.pickupRequest.id}`} className="link text-xs">
                          {item.pickupRequest.requestCode}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">Not scheduled</span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={item.status} />
                    </Td>
                    <Td align="right" className="tabular">
                      {item.estimatedWeightKg === null ? '—' : formatKg(item.estimatedWeightKg)}
                      <span className="block text-xs text-slate-400">{formatDate(item.createdAt)}</span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination meta={page_?.meta} onPageChange={setPage} busy={loading} />
          </>
        )}
      </Card>
    </>
  );
}
