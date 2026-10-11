import {
  GRADE_BANDS,
  qualityGradeFromScore,
  suggestProcessingPath,
} from '../../src/services/inspection.service';
import { formatCode } from '../../src/utils/ids';
import { buildPaginationMeta, parsePagination } from '../../src/utils/http';
import { dateRangeFilter, toNumber } from '../../src/utils/queryFilters';
import { buildSearchFilter } from '../../src/utils/queryFilters';

/**
 * Pure helpers around inspection classification, pagination, identifiers and filters.
 */
describe('quality grading', () => {
  it('maps scores onto the documented bands', () => {
    expect(qualityGradeFromScore(100)).toBe('A');
    expect(qualityGradeFromScore(85)).toBe('A');
    expect(qualityGradeFromScore(84)).toBe('B');
    expect(qualityGradeFromScore(70)).toBe('B');
    expect(qualityGradeFromScore(69)).toBe('C');
    expect(qualityGradeFromScore(50)).toBe('C');
    expect(qualityGradeFromScore(49)).toBe('D');
    expect(qualityGradeFromScore(0)).toBe('D');
  });

  it('has contiguous, non-overlapping bands covering 0-100', () => {
    for (let score = 0; score <= 100; score += 1) {
      const matches = GRADE_BANDS.filter((b) => score >= b.min && score <= b.max);
      expect(matches).toHaveLength(1);
    }
  });

  it('matches the CHECK constraint bands enforced by the database', () => {
    expect(GRADE_BANDS.find((b) => b.grade === 'A')).toEqual({ grade: 'A', min: 85, max: 100 });
    expect(GRADE_BANDS.find((b) => b.grade === 'B')).toEqual({ grade: 'B', min: 70, max: 84 });
    expect(GRADE_BANDS.find((b) => b.grade === 'C')).toEqual({ grade: 'C', min: 50, max: 69 });
    expect(GRADE_BANDS.find((b) => b.grade === 'D')).toEqual({ grade: 'D', min: 0, max: 49 });
  });
});

describe('processing-path suggestion', () => {
  const base = {
    condition: 'FAULTY' as const,
    qualityScore: 60,
    isRepairable: false,
    hazardFlag: false,
    categoryDefaultPath: 'COMPONENT_RECOVERY' as const,
    categoryHazardLevel: 2,
  };

  it('routes a clean repairable item to refurbishment', () => {
    expect(suggestProcessingPath({ ...base, isRepairable: true, qualityScore: 90 })).toBe('REFURBISHMENT');
  });

  it('routes a moderately repairable item to component recovery', () => {
    expect(suggestProcessingPath({ ...base, isRepairable: true, qualityScore: 55 })).toBe('COMPONENT_RECOVERY');
  });

  it('honours the category default for hazardous items', () => {
    expect(
      suggestProcessingPath({ ...base, hazardFlag: true, categoryDefaultPath: 'MATERIAL_RECOVERY' }),
    ).toBe('MATERIAL_RECOVERY');
  });

  it('routes low-quality items to material recovery', () => {
    expect(suggestProcessingPath({ ...base, qualityScore: 30 })).toBe('MATERIAL_RECOVERY');
  });

  it('falls back to the category default path', () => {
    expect(suggestProcessingPath({ ...base, qualityScore: 60 })).toBe('COMPONENT_RECOVERY');
  });
});

describe('business identifiers', () => {
  it('formats codes with a padded sequence', () => {
    expect(formatCode('PR', 1001, 2026)).toBe('PR-2026-01001');
    expect(formatCode('ITM', 42, 2026)).toBe('ITM-2026-00042');
    expect(formatCode('BAT', 99999, 2030)).toBe('BAT-2030-99999');
  });
});

describe('pagination helpers', () => {
  it('applies defaults for missing parameters', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, skip: 0, take: 20 });
  });

  it('honours explicit values and computes the offset', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, skip: 20, take: 10 });
  });

  it('rejects nonsense values and caps the page size', () => {
    expect(parsePagination({ page: '-4', limit: 'abc' })).toEqual({ page: 1, limit: 20, skip: 0, take: 20 });
    expect(parsePagination({ limit: '5000' }, { maxLimit: 100 }).limit).toBe(100);
  });

  it('builds navigation metadata', () => {
    const meta = buildPaginationMeta(45, { page: 2, limit: 20, skip: 20, take: 20 });
    expect(meta).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('handles an empty result set', () => {
    const meta = buildPaginationMeta(0, { page: 1, limit: 20, skip: 0, take: 20 });
    expect(meta.totalPages).toBe(0);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(false);
  });
});

describe('query filters', () => {
  it('marks search fields as case-insensitive', () => {
    const filters = buildSearchFilter('laptop', ['name', 'brand']);
    expect(filters).toEqual([
      { name: { contains: 'laptop', mode: 'insensitive' } },
      { brand: { contains: 'laptop', mode: 'insensitive' } },
    ]);
    expect(buildSearchFilter('', ['name'])).toEqual([]);
    expect(buildSearchFilter(undefined, ['name'])).toEqual([]);
  });

  it('builds an inclusive date range and ignores invalid input', () => {
    const range = dateRangeFilter('2026-01-01', '2026-01-31');
    expect(range?.gte).toBeInstanceOf(Date);
    expect((range?.lte as Date).getUTCHours()).toBe(23);
    expect(dateRangeFilter()).toBeUndefined();
    expect(dateRangeFilter('not-a-date')).toBeUndefined();
  });

  it('converts decimals and nulls to numbers safely', () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined, -1)).toBe(-1);
    expect(toNumber('12.75')).toBe(12.75);
    expect(toNumber('abc', 5)).toBe(5);
  });
});
