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
      className={`status-${status} text-xs font-semibold px-2 py-1 rounded-full inline-block`}
    >
      {statusLabels[status] ?? status}
    </span>
  );
}
