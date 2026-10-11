import {
  ITEM_TRANSITIONS,
  PICKUP_TRANSITIONS,
  BATCH_TRANSITIONS,
  allowedTransitions,
  assertTransition,
  canTransition,
} from '../../src/utils/statusMachine';
import { InvalidTransitionError } from '../../src/lib/errors';

/**
 * The state machines are the contract that makes the lifecycle trustworthy, so every legal
 * edge is asserted explicitly, along with a representative set of illegal ones.
 */
describe('lifecycle state machines', () => {
  describe('pickup request transitions', () => {
    it('allows the happy path', () => {
      expect(canTransition('pickup', 'REQUESTED', 'ASSIGNED')).toBe(true);
      expect(canTransition('pickup', 'ASSIGNED', 'ACCEPTED')).toBe(true);
      expect(canTransition('pickup', 'ACCEPTED', 'COLLECTED')).toBe(true);
      expect(canTransition('pickup', 'COLLECTED', 'RECEIVED_AT_CENTER')).toBe(true);
    });

    it('supports the failure and reassignment branch', () => {
      expect(canTransition('pickup', 'ASSIGNED', 'FAILED')).toBe(true);
      expect(canTransition('pickup', 'ACCEPTED', 'FAILED')).toBe(true);
      expect(canTransition('pickup', 'COLLECTED', 'FAILED')).toBe(true);
      expect(canTransition('pickup', 'FAILED', 'ASSIGNED')).toBe(true);
      expect(canTransition('pickup', 'FAILED', 'CANCELLED')).toBe(true);
    });

    it('rejects skipping steps and terminal-state writes', () => {
      expect(canTransition('pickup', 'REQUESTED', 'COLLECTED')).toBe(false);
      expect(canTransition('pickup', 'REQUESTED', 'ACCEPTED')).toBe(false);
      expect(canTransition('pickup', 'ASSIGNED', 'COLLECTED')).toBe(false);
      expect(canTransition('pickup', 'RECEIVED_AT_CENTER', 'CANCELLED')).toBe(false);
      expect(canTransition('pickup', 'CANCELLED', 'REQUESTED')).toBe(false);
      expect(PICKUP_TRANSITIONS.RECEIVED_AT_CENTER).toHaveLength(0);
      expect(PICKUP_TRANSITIONS.CANCELLED).toHaveLength(0);
    });

    it('never allows a self-transition', () => {
      for (const status of Object.keys(PICKUP_TRANSITIONS)) {
        expect(canTransition('pickup', status, status)).toBe(false);
      }
    });
  });

  describe('item transitions', () => {
    it('allows the full submission-to-recycling chain', () => {
      const chain = [
        ['SUBMITTED', 'PICKUP_SCHEDULED'],
        ['PICKUP_SCHEDULED', 'COLLECTED'],
        ['COLLECTED', 'RECEIVED_AT_CENTER'],
        ['RECEIVED_AT_CENTER', 'INSPECTED'],
        ['INSPECTED', 'IN_BATCH'],
        ['IN_BATCH', 'PROCESSING'],
        ['PROCESSING', 'RECYCLED'],
      ] as const;

      for (const [from, to] of chain) {
        expect(canTransition('item', from, to)).toBe(true);
      }
    });

    it('allows an item to be removed from a batch before processing', () => {
      expect(canTransition('item', 'IN_BATCH', 'INSPECTED')).toBe(true);
    });

    it('prevents impossible jumps', () => {
      expect(canTransition('item', 'SUBMITTED', 'RECYCLED')).toBe(false);
      expect(canTransition('item', 'SUBMITTED', 'INSPECTED')).toBe(false);
      expect(canTransition('item', 'RECYCLED', 'INSPECTED')).toBe(false);
      expect(canTransition('item', 'IN_BATCH', 'RECYCLED')).toBe(false); // must pass through PROCESSING
      expect(canTransition('item', 'CANCELLED', 'SUBMITTED')).toBe(false);
      expect(canTransition('item', 'REJECTED', 'IN_BATCH')).toBe(false);
    });

    it('treats RECYCLED, REJECTED and CANCELLED as terminal', () => {
      expect(ITEM_TRANSITIONS.RECYCLED).toHaveLength(0);
      expect(ITEM_TRANSITIONS.REJECTED).toHaveLength(0);
      expect(ITEM_TRANSITIONS.CANCELLED).toHaveLength(0);
    });
  });

  describe('processing batch transitions', () => {
    it('allows DRAFT -> READY -> RELEASED -> IN_PROGRESS -> COMPLETED', () => {
      expect(canTransition('batch', 'DRAFT', 'READY')).toBe(true);
      expect(canTransition('batch', 'READY', 'RELEASED')).toBe(true);
      expect(canTransition('batch', 'RELEASED', 'IN_PROGRESS')).toBe(true);
      expect(canTransition('batch', 'IN_PROGRESS', 'COMPLETED')).toBe(true);
    });

    it('allows reopening and reassignment', () => {
      expect(canTransition('batch', 'READY', 'DRAFT')).toBe(true);
      expect(canTransition('batch', 'RELEASED', 'READY')).toBe(true);
    });

    it('rejects shortcuts and post-completion writes', () => {
      expect(canTransition('batch', 'DRAFT', 'RELEASED')).toBe(false);
      expect(canTransition('batch', 'DRAFT', 'COMPLETED')).toBe(false);
      expect(canTransition('batch', 'RELEASED', 'COMPLETED')).toBe(false);
      expect(canTransition('batch', 'COMPLETED', 'IN_PROGRESS')).toBe(false);
      expect(BATCH_TRANSITIONS.COMPLETED).toHaveLength(0);
    });
  });

  describe('assertTransition', () => {
    it('resolves for a legal transition', () => {
      expect(() => assertTransition('pickup', 'REQUESTED', 'ASSIGNED')).not.toThrow();
    });

    it('throws InvalidTransitionError with the allowed edges listed', () => {
      try {
        assertTransition('batch', 'DRAFT', 'COMPLETED', 'processing batch');
        throw new Error('expected assertTransition to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTransitionError);
        const typed = error as InvalidTransitionError;
        expect(typed.statusCode).toBe(409);
        expect(typed.code).toBe('INVALID_TRANSITION');
        expect(typed.message).toContain('processing batch');
        expect(typed.message).toContain('DRAFT');
        expect((typed.details as { allowed: string[] }).allowed).toEqual(['READY']);
      }
    });

    it('reports a dedicated message when the entity is already in the target status', () => {
      expect(() => assertTransition('item', 'RECYCLED', 'RECYCLED', 'e-waste item')).toThrow(
        /already in status RECYCLED/,
      );
    });
  });

  describe('allowedTransitions', () => {
    it('returns the outgoing edges for any status', () => {
      expect(allowedTransitions('item', 'INSPECTED')).toEqual(['IN_BATCH', 'REJECTED']);
      expect(allowedTransitions('pickup', 'FAILED')).toEqual(['ASSIGNED', 'CANCELLED']);
      expect(allowedTransitions('batch', 'COMPLETED')).toEqual([]);
    });
  });
});
