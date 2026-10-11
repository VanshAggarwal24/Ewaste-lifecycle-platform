import { useCallback, useState } from 'react';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { ApiError } from '@/api/client';
import { categoryApi } from '@/api/endpoints';
import type { Category } from '@/api/types';
import { useAction, useResource } from '@/hooks/useApi';
import { useToast } from '@/context/ToastContext';
import { PATH_DESCRIPTIONS, PATH_LABELS, PATH_OPTIONS } from '@/lib/domain';
import { formatNumber, humanize } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  HazardBadge,
  InlineError,
  LoadingBlock,
  Modal,
  PageHeader,
  SelectField,
  TableWrap,
  Td,
  TextAreaField,
  TextField,
  Th,
  Tr,
} from '@/components/ui';

const EMPTY = {
  name: '',
  slug: '',
  description: '',
  hazardLevel: '1',
  defaultPath: 'MATERIAL_RECOVERY',
  isActive: true,
};

/** E-waste category reference data: hazard level and default processing path. */
export function CategoriesPage() {
  const toast = useToast();
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [formError, setFormError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const listFetcher = useCallback((signal: AbortSignal) => categoryApi.list({ limit: 100 }, signal), []);
  const { data, loading, error, reload } = useResource(listFetcher);

  const createAction = useAction((payload: Record<string, unknown>) => categoryApi.create(payload), {
    onError: (caught) => {
      setFormError(caught);
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      toast.failure(caught, 'Could not create the category');
    },
  });
  const updateAction = useAction(
    (payload: { id: number; body: Record<string, unknown> }) => categoryApi.update(payload.id, payload.body),
    {
      onError: (caught) => {
        setFormError(caught);
        if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
        toast.failure(caught, 'Could not update the category');
      },
    },
  );
  const deleteAction = useAction((id: number) => categoryApi.remove(id), {
    onError: (caught) => toast.failure(caught, 'Could not delete the category'),
  });
  const toggleAction = useAction(
    (payload: { id: number; isActive: boolean }) => categoryApi.update(payload.id, { isActive: payload.isActive }),
    { onError: (caught) => toast.failure(caught, 'Could not change the category status') },
  );

  const categories = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="E-waste categories"
        description="Categories carry the hazard level and the default processing path suggested to centre staff."
        actions={
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null);
              setForm({ ...EMPTY });
              setFormError(null);
              setFieldErrors({});
              setOpen(true);
            }}
          >
            New category
          </Button>
        }
      />

      <Card>
        <CardHeader title="Categories" subtitle={`${formatNumber(categories.length)} record(s)`} icon={<Tags className="h-4 w-4" />} />

        {loading ? (
          <LoadingBlock label="Loading categories…" />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : categories.length === 0 ? (
          <EmptyState title="No categories" description="At least one category is required before items can be submitted." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Hazard</Th>
                <Th>Default path</Th>
                <Th align="right">Items</Th>
                <Th>State</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <Tr key={category.id}>
                  <Td>
                    <span className="font-medium text-slate-800">{category.name}</span>
                    <span className="block text-xs text-slate-500">{category.slug}</span>
                    {category.description ? (
                      <span className="block max-w-md text-xs text-slate-400">{category.description}</span>
                    ) : null}
                  </Td>
                  <Td>
                    <HazardBadge level={category.hazardLevel} />
                  </Td>
                  <Td>{PATH_LABELS[category.defaultPath] ?? humanize(category.defaultPath)}</Td>
                  <Td align="right" className="tabular">
                    {formatNumber(category._count?.items ?? 0)}
                  </Td>
                  <Td>
                    {category.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setEditing(category);
                          setForm({
                            name: category.name,
                            slug: category.slug,
                            description: category.description ?? '',
                            hazardLevel: String(category.hazardLevel),
                            defaultPath: category.defaultPath,
                            isActive: category.isActive,
                          });
                          setFormError(null);
                          setFieldErrors({});
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const result = await toggleAction.run({ id: category.id, isActive: !category.isActive });
                          if (result) {
                            toast.success(category.isActive ? 'Category deactivated' : 'Category activated');
                            reload();
                          }
                        }}
                      >
                        {category.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => setDeleteTarget(category)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Processing paths" subtitle="Every inspected item is routed to one of these" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          {PATH_OPTIONS.map((path) => (
            <div key={path} className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-sm font-medium text-slate-700">{PATH_LABELS[path]}</p>
              <p className="text-xs text-slate-500">{PATH_DESCRIPTIONS[path]}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Create category'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={createAction.running || updateAction.running}
              onClick={async () => {
                setFormError(null);
                setFieldErrors({});
                const body = {
                  name: form.name.trim(),
                  ...(form.description.trim() ? { description: form.description.trim() } : {}),
                  hazardLevel: Number(form.hazardLevel),
                  defaultPath: form.defaultPath,
                  isActive: form.isActive,
                };
                const result = editing
                  ? await updateAction.run({ id: editing.id, body })
                  : await createAction.run({ ...body, ...(form.slug.trim() ? { slug: form.slug.trim() } : {}) });
                if (result) {
                  toast.success(editing ? 'Category updated' : 'Category created');
                  setOpen(false);
                  reload();
                }
              }}
            >
              {editing ? 'Save changes' : 'Create category'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <InlineError error={formError} />
          <TextField
            label="Name"
            name="categoryName"
            required
            value={form.name}
            error={fieldErrors.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Mobile phones & tablets"
          />
          {!editing ? (
            <TextField
              label="Slug (optional)"
              name="categorySlug"
              value={form.slug}
              error={fieldErrors.slug}
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              hint="Derived from the name when left empty."
            />
          ) : null}
          <TextAreaField
            label="Description"
            name="categoryDescription"
            rows={3}
            value={form.description}
            error={fieldErrors.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Hazard level"
              name="categoryHazard"
              value={form.hazardLevel}
              error={fieldErrors.hazardLevel}
              onChange={(event) => setForm((current) => ({ ...current, hazardLevel: event.target.value }))}
              options={[1, 2, 3, 4, 5].map((level) => ({
                value: String(level),
                label: `${level} — ${level >= 4 ? 'high' : level === 3 ? 'moderate' : 'low'} risk`,
              }))}
            />
            <SelectField
              label="Default processing path"
              name="categoryPath"
              value={form.defaultPath}
              error={fieldErrors.defaultPath}
              onChange={(event) => setForm((current) => ({ ...current, defaultPath: event.target.value }))}
              options={PATH_OPTIONS.map((path) => ({ value: path, label: PATH_LABELS[path] ?? humanize(path) }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Active — available for selection in submission forms
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        busy={deleteAction.running}
        title="Delete this category?"
        message={`${deleteTarget?.name ?? 'This category'} can only be deleted when no items use it. Otherwise deactivate it instead.`}
        confirmLabel="Delete category"
        onConfirm={async () => {
          if (!deleteTarget) return;
          const result = await deleteAction.run(deleteTarget.id);
          if (result) {
            toast.success('Category deleted');
            setDeleteTarget(null);
            reload();
          }
        }}
      />
    </>
  );
}
