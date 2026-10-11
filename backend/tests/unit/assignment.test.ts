import {
  NEUTRAL_RELIABILITY_SCORE,
  SAME_CITY_DISTANCE_SCORE,
  UNKNOWN_DISTANCE_SCORE,
  compareScoredCandidates,
  resolveRequestLocation,
  scoreCandidate,
  scoreCandidates,
  selectBestCandidate,
  type AgentCandidate,
  type AssignmentConfig,
  type AssignmentContext,
} from '../../src/services/assignment.service';

/**
 * The assignment engine is deterministic and pure, so its rules are asserted directly here
 * without touching the database. Integration tests cover the transactional persistence.
 */

const CONFIG: AssignmentConfig = {
  maxDistanceKm: 50,
  weights: { distance: 0.45, workload: 0.25, availability: 0.2, capacity: 0.1 },
  neutralReliability: NEUTRAL_RELIABILITY_SCORE,
};

function candidate(overrides: Partial<AgentCandidate> = {}): AgentCandidate {
  return {
    agentProfileId: 1,
    userId: 101,
    fullName: 'Agent One',
    centerId: 1,
    centerCity: 'Chennai',
    centerCoordinates: { latitude: 13.0, longitude: 80.2 },
    userCity: 'Chennai',
    userCoordinates: { latitude: 13.0, longitude: 80.2 },
    isAvailable: true,
    isVerified: true,
    currentLoadCount: 0,
    maxDailyPickups: 10,
    vehicleCapacityKg: 300,
    ratingAvg: 4.5,
    ...overrides,
  };
}

function context(overrides: Partial<AssignmentContext> = {}): AssignmentContext {
  return {
    pickupRequestId: 1,
    requestCity: 'Chennai',
    requestPincode: '600032',
    requestCoordinates: { latitude: 13.0067, longitude: 80.2206 },
    requestCenterId: null,
    estimatedWeightKg: null,
    ...overrides,
  };
}

describe('assignment engine — eligibility filters', () => {
  it('accepts a healthy candidate', () => {
    const scored = scoreCandidate(context(), candidate(), CONFIG, 300);
    expect(scored.eligible).toBe(true);
    expect(scored.exclusionReasons).toEqual([]);
  });

  it('rejects an unverified agent', () => {
    const scored = scoreCandidate(context(), candidate({ isVerified: false }), CONFIG, 300);
    expect(scored.eligible).toBe(false);
    expect(scored.exclusionReasons).toContain('Agent profile is not verified for assignments');
  });

  it('rejects an unavailable agent', () => {
    const scored = scoreCandidate(context(), candidate({ isAvailable: false }), CONFIG, 300);
    expect(scored.eligible).toBe(false);
    expect(scored.exclusionReasons.join(' ')).toMatch(/unavailable/);
  });

  it('rejects an agent who has reached the daily pickup ceiling', () => {
    const scored = scoreCandidate(
      context(),
      candidate({ currentLoadCount: 10, maxDailyPickups: 10 }),
      CONFIG,
      300,
    );
    expect(scored.eligible).toBe(false);
    expect(scored.exclusionReasons.join(' ')).toMatch(/at capacity/);
  });

  it('rejects an agent whose vehicle is too small for the estimated load', () => {
    const scored = scoreCandidate(
      context({ estimatedWeightKg: 500 }),
      candidate({ vehicleCapacityKg: 300 }),
      CONFIG,
      900,
    );
    expect(scored.eligible).toBe(false);
    expect(scored.exclusionReasons.join(' ')).toMatch(/Vehicle capacity/);
  });

  it('accepts an agent whose vehicle is exactly large enough', () => {
    const scored = scoreCandidate(
      context({ estimatedWeightKg: 300 }),
      candidate({ vehicleCapacityKg: 300 }),
      CONFIG,
      900,
    );
    expect(scored.eligible).toBe(true);
  });

  it('rejects an agent attached to another centre when the request is centre-bound', () => {
    const scored = scoreCandidate(
      context({ requestCenterId: 2 }),
      candidate({ centerId: 1 }),
      CONFIG,
      300,
    );
    expect(scored.eligible).toBe(false);
    expect(scored.exclusionReasons.join(' ')).toMatch(/different collection centre/);
  });

  it('rejects an agent beyond the service radius', () => {
    const scored = scoreCandidate(
      context(),
      candidate({
        // No personal coordinates: the agent is located by the centre they belong to.
        userCoordinates: null,
        centerCoordinates: { latitude: 11.0168, longitude: 76.9558 },
        centerCity: 'Coimbatore',
      }),
      CONFIG,
      300,
    );
    expect(scored.eligible).toBe(false);
    expect(scored.exclusionReasons.join(' ')).toMatch(/exceeds the 50 km service radius/);
    expect(scored.components.distance).toBe(0);
  });

  it('collects multiple reasons instead of stopping at the first', () => {
    const scored = scoreCandidate(
      context(),
      candidate({ isVerified: false, isAvailable: false }),
      CONFIG,
      300,
    );
    expect(scored.exclusionReasons).toHaveLength(2);
  });
});

describe('assignment engine — scoring', () => {
  it('scores a nearer agent above a farther agent, all else equal', () => {
    const near = scoreCandidate(context(), candidate({ agentProfileId: 1 }), CONFIG, 300);
    const far = scoreCandidate(
      context(),
      candidate({
        agentProfileId: 2,
        userCoordinates: { latitude: 13.15, longitude: 80.3 },
        centerCoordinates: { latitude: 13.15, longitude: 80.3 },
      }),
      CONFIG,
      300,
    );

    expect(near.components.distance).toBeGreaterThan(far.components.distance);
    expect(near.totalScore).toBeGreaterThan(far.totalScore);
  });

  it('scores a less loaded agent above a busier one', () => {
    const idle = scoreCandidate(context(), candidate({ currentLoadCount: 0 }), CONFIG, 300);
    const busy = scoreCandidate(context(), candidate({ currentLoadCount: 8 }), CONFIG, 300);

    expect(idle.components.workload).toBe(1);
    expect(busy.components.workload).toBeCloseTo(0.2, 5);
    expect(idle.totalScore).toBeGreaterThan(busy.totalScore);
  });

  it('scores a better rated agent above a lower rated one', () => {
    const good = scoreCandidate(context(), candidate({ ratingAvg: 5 }), CONFIG, 300);
    const poor = scoreCandidate(context(), candidate({ ratingAvg: 1 }), CONFIG, 300);

    expect(good.components.reliability).toBe(1);
    expect(poor.components.reliability).toBe(0.2);
    expect(good.totalScore).toBeGreaterThan(poor.totalScore);
  });

  it('treats an agent with no rating history as neutral rather than worst', () => {
    const fresh = scoreCandidate(context(), candidate({ ratingAvg: 0 }), CONFIG, 300);
    expect(fresh.components.reliability).toBe(NEUTRAL_RELIABILITY_SCORE);
  });

  it('normalises vehicle capacity against the best peer', () => {
    const small = scoreCandidate(context(), candidate({ vehicleCapacityKg: 150 }), CONFIG, 300);
    const large = scoreCandidate(context(), candidate({ vehicleCapacityKg: 300 }), CONFIG, 300);

    expect(large.components.capacity).toBe(1);
    expect(small.components.capacity).toBeCloseTo(0.5, 5);
  });

  it('keeps every component, and the total, within [0, 1]', () => {
    const scored = scoreCandidates(
      context(),
      [
        candidate({ agentProfileId: 1, ratingAvg: 5, currentLoadCount: 0, vehicleCapacityKg: 1000 }),
        candidate({ agentProfileId: 2, ratingAvg: 0, currentLoadCount: 9, vehicleCapacityKg: 10 }),
        candidate({ agentProfileId: 3, isAvailable: false }),
      ],
      CONFIG,
    );

    for (const row of scored) {
      for (const value of Object.values(row.components)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(row.totalScore).toBeGreaterThanOrEqual(0);
      expect(row.totalScore).toBeLessThanOrEqual(1);
    }
  });

  it('applies the configured weights exactly', () => {
    // Perfect distance (0 km) + zero load + max rating + best capacity should equal 1.0.
    const perfect = scoreCandidate(
      context(),
      candidate({
        userCoordinates: { latitude: 13.0067, longitude: 80.2206 },
        centerCoordinates: null,
        currentLoadCount: 0,
        ratingAvg: 5,
        vehicleCapacityKg: 300,
      }),
      CONFIG,
      300,
    );

    expect(perfect.components.distance).toBeCloseTo(1, 3);
    expect(perfect.totalScore).toBeCloseTo(1, 3);
  });

  it('responds to a re-weighted configuration (distance weight moved to workload)', () => {
    const distantIdle = candidate({
      agentProfileId: 1,
      // ~33 km from the pickup: eligible, but far enough to lose on a distance-weighted score.
      userCoordinates: { latitude: 13.3, longitude: 80.25 },
      centerCoordinates: { latitude: 13.3, longitude: 80.25 },
      currentLoadCount: 0,
    });
    const nearBusy = candidate({
      agentProfileId: 2,
      currentLoadCount: 9,
    });

    const distanceFocused = scoreCandidates(context(), [distantIdle, nearBusy], CONFIG);
    expect(selectBestCandidate(distanceFocused)?.agentProfileId).toBe(2);

    const workloadFocused = scoreCandidates(context(), [distantIdle, nearBusy], {
      ...CONFIG,
      weights: { distance: 0.1, workload: 0.8, availability: 0.05, capacity: 0.05 },
    });
    expect(selectBestCandidate(workloadFocused)?.agentProfileId).toBe(1);
  });
});

describe('assignment engine — missing coordinates', () => {
  it('prefers explicit coordinates for the request', () => {
    const resolved = resolveRequestLocation(context());
    expect(resolved.source).toBe('COORDINATES');
  });

  it('falls back to a pincode centroid when the request has no coordinates', () => {
    const resolved = resolveRequestLocation(context({ requestCoordinates: null, requestPincode: '600032' }));
    expect(resolved.source).toBe('PINCODE_CENTROID');
    expect(resolved.coordinates).not.toBeNull();
  });

  it('reports UNKNOWN when neither coordinates nor a usable pincode exist', () => {
    const resolved = resolveRequestLocation(
      context({ requestCoordinates: null, requestPincode: 'n/a' }),
    );
    expect(resolved.source).toBe('UNKNOWN');
    expect(resolved.coordinates).toBeNull();
  });

  it('uses the neutral distance score and records CITY when only the city matches', () => {
    const scored = scoreCandidate(
      context({ requestCoordinates: null, requestPincode: 'bad', requestCity: 'Chennai' }),
      candidate({ userCoordinates: null, centerCoordinates: null, centerCity: 'Chennai' }),
      CONFIG,
      300,
    );

    expect(scored.eligible).toBe(true);
    expect(scored.distanceSource).toBe('CITY');
    expect(scored.distanceKm).toBeNull();
    expect(scored.components.distance).toBe(SAME_CITY_DISTANCE_SCORE);
  });

  it('uses the neutral score and reports UNKNOWN when nothing is known at all', () => {
    const scored = scoreCandidate(
      context({ requestCoordinates: null, requestPincode: 'bad', requestCity: 'Chennai' }),
      candidate({ userCoordinates: null, centerCoordinates: null, centerCity: 'Mumbai' }),
      CONFIG,
      300,
    );

    expect(scored.distanceSource).toBe('UNKNOWN');
    expect(scored.components.distance).toBe(UNKNOWN_DISTANCE_SCORE);
  });

  it('still produces a deterministic winner when no coordinates exist', () => {
    const scored = scoreCandidates(
      context({ requestCoordinates: null, requestPincode: 'bad', requestCity: 'Nowhere' }),
      [candidate({ agentProfileId: 7 }), candidate({ agentProfileId: 3 })],
      CONFIG,
    );
    expect(selectBestCandidate(scored)?.agentProfileId).toBe(3);
  });
});

describe('assignment engine — determinism and tie-breaking', () => {
  it('is stable: identical input always produces the identical ranking', () => {
    const candidates = [
      candidate({ agentProfileId: 5, currentLoadCount: 2, ratingAvg: 4.0 }),
      candidate({ agentProfileId: 2, currentLoadCount: 2, ratingAvg: 4.0 }),
      candidate({ agentProfileId: 9, currentLoadCount: 7, ratingAvg: 3.0 }),
    ];

    const first = scoreCandidates(context(), candidates, CONFIG).map((c) => c.agentProfileId);
    const second = scoreCandidates(context(), [...candidates].reverse(), CONFIG).map((c) => c.agentProfileId);

    expect(first).toEqual(second);
  });

  it('breaks an exact tie by the lower agent profile id', () => {
    const identical = (id: number) =>
      candidate({
        agentProfileId: id,
        userId: 1000 + id,
        currentLoadCount: 3,
        ratingAvg: 4,
        vehicleCapacityKg: 200,
      });

    const scored = scoreCandidates(context(), [identical(8), identical(3), identical(5)], CONFIG);
    expect(scored.map((c) => c.agentProfileId)).toEqual([3, 5, 8]);
  });

  it('ranks a known distance above an unknown distance when totals are equal', () => {
    const a = scoreCandidate(context(), candidate({ agentProfileId: 1 }), CONFIG, 300);
    const b = scoreCandidate(
      context({ requestCoordinates: null, requestPincode: 'bad', requestCity: 'Chennai' }),
      candidate({
        agentProfileId: 2,
        userCoordinates: null,
        centerCoordinates: null,
        centerCity: 'Chennai',
      }),
      CONFIG,
      300,
    );

    const comparator = compareScoredCandidates({ ...a, totalScore: 0.5 }, { ...b, totalScore: 0.5 });
    expect(comparator).toBeLessThan(0); // a (known) first
  });

  it('returns null when nobody is eligible', () => {
    const scored = scoreCandidates(
      context(),
      [candidate({ isVerified: false }), candidate({ isAvailable: false })],
      CONFIG,
    );
    expect(selectBestCandidate(scored)).toBeNull();
  });

  it('never selects an ineligible candidate even if it scores highest', () => {
    const scored = scoreCandidates(
      context(),
      [
        candidate({ agentProfileId: 1, isVerified: false, ratingAvg: 5, currentLoadCount: 0 }),
        candidate({ agentProfileId: 2, ratingAvg: 3, currentLoadCount: 4 }),
      ],
      CONFIG,
    );

    const best = selectBestCandidate(scored);
    expect(best?.agentProfileId).toBe(2);
  });
});
