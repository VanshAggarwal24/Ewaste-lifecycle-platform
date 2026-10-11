import type { Tx } from '../lib/prisma';

/**
 * Human-readable business identifiers.
 *
 * Codes are drawn from PostgreSQL sequences (created in the
 * `20261011104500_code_sequences` migration), so they are unique, monotonic and safe
 * under concurrency — two simultaneous submissions can never collide, unlike a
 * "SELECT max(id)+1" approach.
 *
 * Format: <PREFIX>-<YYYY>-<sequence padded to 5 digits>, e.g. `PR-2026-01042`.
 *
 * Note: sequences are not transactional. A rolled-back transaction leaves a gap in the
 * numbering, which is expected and harmless — sequence values are identifiers, not a
 * count of records.
 */

export type CodeKind = 'pickup' | 'item' | 'batch';

export function formatCode(prefix: string, sequenceValue: number, year = new Date().getUTCFullYear()): string {
  return `${prefix}-${year}-${String(sequenceValue).padStart(5, '0')}`;
}

async function nextSequenceValue(tx: Tx, kind: CodeKind): Promise<number> {
  // The sequence name is chosen from a fixed literal switch — never from user input —
  // so there is no injection surface here.
  switch (kind) {
    case 'pickup': {
      const rows = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('pickup_request_code_seq') AS n`;
      return Number(rows[0].n);
    }
    case 'item': {
      const rows = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('ewaste_item_code_seq') AS n`;
      return Number(rows[0].n);
    }
    case 'batch': {
      const rows = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('processing_batch_code_seq') AS n`;
      return Number(rows[0].n);
    }
    default: {
      // Exhaustiveness guard — TypeScript narrows `kind` to `never` here.
      throw new Error(`Unknown code kind: ${String(kind)}`);
    }
  }
}

export async function nextCode(tx: Tx, kind: CodeKind): Promise<string> {
  const prefix = kind === 'pickup' ? 'PR' : kind === 'item' ? 'ITM' : 'BAT';
  return formatCode(prefix, await nextSequenceValue(tx, kind));
}

export const nextPickupRequestCode = (tx: Tx) => nextCode(tx, 'pickup');
export const nextItemCode = (tx: Tx) => nextCode(tx, 'item');
export const nextBatchCode = (tx: Tx) => nextCode(tx, 'batch');
