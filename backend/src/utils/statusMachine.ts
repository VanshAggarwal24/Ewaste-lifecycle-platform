import type { BatchStatus, ItemStatus, PickupStatus } from '@prisma/client';
import { InvalidTransitionError } from '../lib/errors';

/**
 * Explicit lifecycle state machines.
 *
 * The platform is a *lifecycle tracker*: the value of the system comes from being able to
 * prove that every item moved through legal, timestamped states only. Every status update
 * therefore goes through `assertTransition`, which rejects anything not listed here.
 *
 * Allowed edges (current -> next):
 */

export const PICKUP_TRANSITIONS: Record<PickupStatus, readonly PickupStatus[]> = {
  REQUESTED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['ACCEPTED', 'FAILED', 'CANCELLED'],
  ACCEPTED: ['COLLECTED', 'FAILED'],
  COLLECTED: ['RECEIVED_AT_CENTER', 'FAILED'],
  RECEIVED_AT_CENTER: [],
  FAILED: ['ASSIGNED', 'CANCELLED'], // reassignment path
  CANCELLED: [],
};

export const ITEM_TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  SUBMITTED: ['PICKUP_SCHEDULED', 'CANCELLED', 'REJECTED'],
  PICKUP_SCHEDULED: ['COLLECTED', 'SUBMITTED', 'CANCELLED'],
  COLLECTED: ['RECEIVED_AT_CENTER'],
  RECEIVED_AT_CENTER: ['INSPECTED', 'REJECTED'],
  INSPECTED: ['IN_BATCH', 'REJECTED'],
  IN_BATCH: ['PROCESSING', 'INSPECTED'], // INSPECTED = removed from a batch before processing
  PROCESSING: ['RECYCLED'],
  RECYCLED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const BATCH_TRANSITIONS: Record<BatchStatus, readonly BatchStatus[]> = {
  DRAFT: ['READY'],
  READY: ['DRAFT', 'RELEASED'],
  RELEASED: ['IN_PROGRESS', 'READY'], // READY = recycler un-assigned for a different one
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
};

/** Terminal states never accept further writes. */
export const TERMINAL_PICKUP_STATES: readonly PickupStatus[] = ['RECEIVED_AT_CENTER', 'CANCELLED'];
export const TERMINAL_ITEM_STATES: readonly ItemStatus[] = ['RECYCLED', 'REJECTED', 'CANCELLED'];
export const TERMINAL_BATCH_STATES: readonly BatchStatus[] = ['COMPLETED'];

type Machine = 'pickup' | 'item' | 'batch';

const MACHINES: Record<Machine, Record<string, readonly string[]>> = {
  pickup: PICKUP_TRANSITIONS as Record<string, readonly string[]>,
  item: ITEM_TRANSITIONS as Record<string, readonly string[]>,
  batch: BATCH_TRANSITIONS as Record<string, readonly string[]>,
};

export function canTransition(machine: Machine, from: string, to: string): boolean {
  if (from === to) return false;
  return (MACHINES[machine][from] ?? []).includes(to);
}

export function allowedTransitions(machine: Machine, from: string): readonly string[] {
  return MACHINES[machine][from] ?? [];
}

/**
 * Throws `InvalidTransitionError` (HTTP 409) unless `from -> to` is a legal edge.
 * The message is written for humans reading an API error or a log line.
 */
export function assertTransition(machine: Machine, from: string, to: string, label: string = machine): void {
  if (from === to) {
    throw new InvalidTransitionError(
      `${label} is already in status ${from}`,
      { from, to, allowed: allowedTransitions(machine, from) },
    );
  }

  if (!canTransition(machine, from, to)) {
    throw new InvalidTransitionError(
      `Illegal ${label} transition: ${from} → ${to}`,
      { from, to, allowed: allowedTransitions(machine, from) },
    );
  }
}
