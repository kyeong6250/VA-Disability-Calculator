/**
 * VA disability "combined ratings" math and 2026 compensation lookup.
 * Pure functions, no DOM -- importable from both the browser (index.html)
 * and Node (tests/calc.test.js) as a plain ES module.
 *
 * Rating combination follows 38 CFR 4.25 (combined ratings table) and 4.26
 * (bilateral factor): each rating is applied to the *remaining* efficiency
 * (100% minus everything already combined), not added to the raw total,
 * then the final combined value is rounded to the nearest 10.
 *
 * Compensation figures are the 2026 VA rates (2.8% COLA, effective
 * 2025-12-01) as published at va.gov/disability/compensation-rates/veteran-rates/.
 */

// veteran-alone / +spouse / +spouse+1st child / +1st child only (no spouse)
export const BASE_RATES = {
  10: { alone: 180.42 },
  20: { alone: 356.66 },
  30: { alone: 552.47, spouse: 617.47, spouseChild: 666.47, childOnly: 596.47 },
  40: { alone: 795.84, spouse: 882.84, spouseChild: 947.84, childOnly: 853.84 },
  50: { alone: 1132.9, spouse: 1241.9, spouseChild: 1322.9, childOnly: 1205.9 },
  60: { alone: 1435.02, spouse: 1566.02, spouseChild: 1663.02, childOnly: 1523.02 },
  70: { alone: 1808.45, spouse: 1961.45, spouseChild: 2074.45, childOnly: 1910.45 },
  80: { alone: 2102.15, spouse: 2277.15, spouseChild: 2406.15, childOnly: 2219.15 },
  90: { alone: 2362.3, spouse: 2559.3, spouseChild: 2704.3, childOnly: 2494.3 },
  100: { alone: 3938.58, spouse: 4158.17, spouseChild: 4318.99, childOnly: 4085.43 },
};

// Flat additive amounts, per rating tier, for dependents beyond the first
// child already baked into the base rows above. Verified by cross-checking
// va.gov's "1 parent" / "2 parent" base rows (their difference equals the
// "parent" figure below at every tier) since va.gov doesn't publish that one
// as a standalone additive row the way it does for children and A&A.
export const ADDITIONAL_RATES = {
  30: { childUnder18: 32.0, childInSchool: 105.0, parent: 52.0, spouseAA: 61.0 },
  40: { childUnder18: 43.0, childInSchool: 140.0, parent: 70.0, spouseAA: 81.0 },
  50: { childUnder18: 54.0, childInSchool: 176.0, parent: 88.0, spouseAA: 101.0 },
  60: { childUnder18: 65.0, childInSchool: 211.0, parent: 105.0, spouseAA: 121.0 },
  70: { childUnder18: 76.0, childInSchool: 246.0, parent: 123.0, spouseAA: 141.0 },
  80: { childUnder18: 87.0, childInSchool: 281.0, parent: 140.0, spouseAA: 161.0 },
  90: { childUnder18: 98.0, childInSchool: 317.0, parent: 158.0, spouseAA: 181.0 },
  100: { childUnder18: 109.11, childInSchool: 352.45, parent: 176.24, spouseAA: 201.41 },
};

export const VALID_RATINGS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** Combine a flat list of ratings using the VA "whole person" method.
 * Returns the *unrounded* combined percentage. Ratings are applied highest
 * to lowest against whatever efficiency remains, not added to the raw sum. */
export function combineRatingsRaw(ratings) {
  const sorted = [...ratings].sort((a, b) => b - a);
  let remaining = 100;
  for (const r of sorted) {
    remaining -= remaining * (r / 100);
  }
  return 100 - remaining;
}

/** Round a combined rating to the nearest 10 (half rounds up: 64->60, 65->70). */
export function roundToNearestTen(value) {
  return Math.round(value / 10) * 10;
}

/**
 * Combine a list of conditions, applying the bilateral factor first when
 * two or more are marked bilateral (paired arms, paired legs, or other
 * paired skeletal muscle groups). Per 38 CFR 4.26: combine the bilateral
 * group's ratings among themselves (unrounded), add 10% of that combined
 * value, then combine the result with everything else and round only once,
 * at the very end.
 *
 * @param {{rating: number, bilateral?: boolean}[]} conditions
 * @returns {{combinedRaw: number, combinedRounded: number, bilateralGroup: number[], bilateralCombinedRaw: number|null, bilateralAdjusted: number|null}}
 */
export function combineConditions(conditions) {
  const active = conditions.filter((c) => c.rating > 0);
  const bilateral = active.filter((c) => c.bilateral).map((c) => c.rating);
  const normal = active.filter((c) => !c.bilateral).map((c) => c.rating);

  let values = [...normal];
  let bilateralCombinedRaw = null;
  let bilateralAdjusted = null;

  if (bilateral.length >= 2) {
    bilateralCombinedRaw = combineRatingsRaw(bilateral);
    bilateralAdjusted = bilateralCombinedRaw * 1.1;
    values.push(bilateralAdjusted);
  } else {
    // Fewer than 2 bilateral-marked ratings: no pairing, no bonus.
    values.push(...bilateral);
  }

  const combinedRaw = values.length ? combineRatingsRaw(values) : 0;
  const combinedRounded = roundToNearestTen(combinedRaw);

  return {
    combinedRaw,
    combinedRounded,
    bilateralGroup: bilateral,
    bilateralCombinedRaw,
    bilateralAdjusted,
  };
}

/**
 * Look up monthly compensation for a final (already rounded, multiple-of-10)
 * combined rating and a dependent household. Ratings under 30% pay a flat
 * rate regardless of dependents, per VA rules.
 *
 * @param {number} rating - 0-100, multiple of 10
 * @param {{hasSpouse?: boolean, spouseAA?: boolean, childrenUnder18?: number, childrenInSchool?: number, dependentParents?: number}} deps
 */
export function lookupCompensation(rating, deps = {}) {
  if (!VALID_RATINGS.includes(rating)) {
    throw new RangeError(`rating must be a multiple of 10 between 0 and 100, got ${rating}`);
  }
  if (rating === 0) return 0;

  const {
    hasSpouse = false,
    spouseAA = false,
    childrenUnder18 = 0,
    childrenInSchool = 0,
    dependentParents = 0,
  } = deps;

  if (rating < 30) {
    return BASE_RATES[rating].alone;
  }

  const base = BASE_RATES[rating];
  const hasChild = childrenUnder18 > 0;

  let total;
  if (hasSpouse && hasChild) total = base.spouseChild;
  else if (hasSpouse) total = base.spouse;
  else if (hasChild) total = base.childOnly;
  else total = base.alone;

  const add = ADDITIONAL_RATES[rating];
  const extraChildrenUnder18 = hasChild ? childrenUnder18 - 1 : 0;

  total += extraChildrenUnder18 * add.childUnder18;
  total += childrenInSchool * add.childInSchool;
  total += dependentParents * add.parent;
  if (hasSpouse && spouseAA) total += add.spouseAA;

  return Math.round(total * 100) / 100;
}
