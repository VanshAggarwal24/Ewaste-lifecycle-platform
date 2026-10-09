import React from 'react';

const statusLabels: Record<string, string> = {
  SUBMITTED:          'Submitted',
  PICKUP_REQUESTED:   'Pickup Requested',
  PICKUP_ASSIGNED:    'Pickup Assigned',
  COLLECTED:          'Collected',
  RECEIVED_AT_CENTER: 'At Center',
  INSPECTED:          'Inspected',
  PROCESSING:         'Processing',
  RECYCLED:           'Recycled',
  REFURBISHED:        'Refurbished',
  DISPOSED:           'Disposed',
  CANCELLED:          'Cancelled',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`status-${status} inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full transition-colors`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {statusLabels[status] ?? status?.replace(/_/g, ' ')}
    </span>
  );
}

