import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Recycle } from 'lucide-react';
import { recoveryApi } from '@/api/endpoints';
import type { RecoveredMaterial } from '@/api/types';
import { useResource } from '@/hooks/useApi';
import { MATERIAL_LABELS, MATERIAL_OPTIONS } from '@/lib/domain';
import { formatCurrency, formatDateTime, formatKg, formatNumber, formatPercent, humanize } from '@/lib/format';
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
  TableWrap,
  Td,
  Th,
  Tr,
} from '@/components/ui';

/**
 * Recovery ledger. Aggregated totals come from `GET /api/recoveries/by-material`, which
 * GROUP BYs the recovery table — the same rows the table below lists.
 */
export function RecoveriesPage() {
  const [page, setPage] = useState(1);
  const [materialType, setMaterialType] = useState('');

  const listFetcher = useCallback(
    (signal: AbortSignal) => recoveryApi.list({ page, limit: 20, ...(materialType ? { materialType } : {}) }, signal),
    [page, materialType],
  );
  const totalsFetcher = useCallback((signal: AbortSignal) => recoveryApi.byMaterial(undefined, signal), []);

  const { data, loading, error, reload } = useResource(listFetcher);
  const { data: totals } = useResource(totalsFetcher);

  const rows = data?.data ?? [];
  const totalsRows = totals ?? [];
  const totalQuantity = useMemo(
    () => totalsRows.reduce((sum, row) => sum + Number(row.quantityKg ?? 0), 0),
    [totalsRows],
  );
  const totalRecords = useMemo(() => totalsRows.reduce((sum, row) => sum + Number(row.records ?? 0), 0), [totalsRows]);

  return (
    <>
      <PageHeader
        title="Material recovery"
        description="Every recovered stream your organisation has booked, with purity assays and market value."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Recovered weight" value={formatKg(totalQuantity)} icon={<Recycle className="h-5 w-5" />} />
        <StatCard label="Recovery records" value={formatNumber(totalRecords)} tone="sky" />
        <StatCard label="Material streams" value={formatNumber(totalsRows.length)} tone="clay" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recovery records"
            subtitle={data?.meta ? `${formatNumber(data.meta.total)} records` : undefined}
            actions={
              <SelectField
                label=""
                name="recoveryMaterialFilter"
                value={materialType}
                placeholder="All materials"
                className="w-56"
                onChange={(event) => {
                  setMaterialType(event.target.value);
                  setPage(1);
                }}
                options={MATERIAL_OPTIONS.map((value) => ({ value, label: MATERIAL_LABELS[value] ?? humanize(value) }))}
              />
            }
          />

          {loading ? (
            <LoadingBlock label="Loading recovery records…" />
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No recovery records"
              description="Records are added while a batch is IN_PROGRESS, from the batch page."
            />
          ) : (
            <>
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th>Batch</Th>
                    <Th align="right">Quantity</Th>
                    <Th align="right">Purity</Th>
                    <Th align="right">Value / kg</Th>
                    <Th align="right">Total value</Th>
                    <Th>Recorded</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((recovery: RecoveredMaterial) => (
                    <Tr key={recovery.id}>
                      <Td>
                        <span className="font-medium text-slate-800">
                          {MATERIAL_LABELS[recovery.materialType] ?? humanize(recovery.materialType)}
                        </span>
                        {recovery.item ? (
                          <span className="block text-xs text-slate-500">
                            {recovery.item.itemCode} — {recovery.item.name}
                          </span>
                        ) : (
                          <span className="block text-xs text-slate-400">Batch level</span>
                        )}
                      </Td>
                      <Td>
                        {recovery.batch ? (
                          <Link to={`/batches/${recovery.batch.id}`} className="link text-sm">
                            {recovery.batch.batchCode}
                          </Link>
                        ) : (
                          `#${recovery.batchId}`
                        )}
                      </Td>
                      <Td align="right" className="tabular">
                        {formatKg(recovery.quantityKg)}
                      </Td>
                      <Td align="right" className="tabular">
                        {recovery.purityPct === null ? '—' : formatPercent(recovery.purityPct)}
                      </Td>
                      <Td align="right" className="tabular">
                        {recovery.marketValuePerKg === null ? '—' : formatCurrency(recovery.marketValuePerKg)}
                      </Td>
                      <Td align="right" className="tabular">
                        {recovery.marketValuePerKg === null
                          ? '—'
                          : formatCurrency(Number(recovery.marketValuePerKg) * Number(recovery.quantityKg))}
                      </Td>
                      <Td>
                        <span className="text-xs text-slate-500">{formatDateTime(recovery.recordedAt)}</span>
                        {recovery.recordedBy ? (
                          <span className="block text-xs text-slate-400">{recovery.recordedBy.fullName}</span>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
              <Pagination meta={data?.meta} onPageChange={setPage} busy={loading} />
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="By material type" subtitle="Database aggregate (GROUP BY material_type)" />
          <CardBody>
            {totalsRows.length === 0 ? (
              <EmptyState title="No aggregates yet" />
            ) : (
              <ul className="space-y-3">
                {totalsRows.map((row) => (
                  <li key={row.materialType} className="border-b border-slate-100 pb-2 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">
                        {MATERIAL_LABELS[row.materialType] ?? humanize(row.materialType)}
                      </span>
                      <span className="tabular text-sm text-slate-700">{formatKg(row.quantityKg)}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {formatNumber(row.records)} record(s)
                      {row.averagePurityPct === null ? '' : ` · average purity ${formatPercent(row.averagePurityPct)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <Button variant="secondary" size="sm" onClick={reload}>
                Refresh records
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
