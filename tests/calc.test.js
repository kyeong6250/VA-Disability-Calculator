import { test } from "node:test";
import assert from "node:assert/strict";
import {
  combineRatingsRaw,
  roundToNearestTen,
  combineConditions,
  lookupCompensation,
  BASE_RATES,
  ADDITIONAL_RATES,
} from "../calc.js";

test("combineRatingsRaw matches the worked example from roblevine.com (50, 20, 10 -> 64 raw)", () => {
  const raw = combineRatingsRaw([50, 20, 10]);
  assert.ok(Math.abs(raw - 64) < 1e-9, `expected ~64, got ${raw}`);
});

test("combineRatingsRaw is order-independent (always sorts descending internally)", () => {
  assert.equal(combineRatingsRaw([10, 50, 20]), combineRatingsRaw([50, 20, 10]));
});

test("combineRatingsRaw of a single rating returns that rating", () => {
  assert.equal(combineRatingsRaw([40]), 40);
});

test("roundToNearestTen rounds .4 down and .5 up, per VA rounding rule", () => {
  assert.equal(roundToNearestTen(64), 60);
  assert.equal(roundToNearestTen(65), 70);
  assert.equal(roundToNearestTen(84.9), 80);
  assert.equal(roundToNearestTen(85), 90);
});

test("combineConditions with no bilateral ratings matches plain combineRatingsRaw + rounding", () => {
  const result = combineConditions([{ rating: 50 }, { rating: 20 }, { rating: 10 }]);
  assert.equal(result.combinedRounded, 60);
  assert.equal(result.bilateralGroup.length, 0);
});

test("combineConditions applies the bilateral factor: two 20% legs combine to 36, +10% = 39.6", () => {
  const result = combineConditions([
    { rating: 20, bilateral: true },
    { rating: 20, bilateral: true },
  ]);
  assert.ok(Math.abs(result.bilateralCombinedRaw - 36) < 1e-9, `expected 36, got ${result.bilateralCombinedRaw}`);
  assert.ok(Math.abs(result.bilateralAdjusted - 39.6) < 1e-9, `expected 39.6, got ${result.bilateralAdjusted}`);
  assert.equal(result.combinedRounded, 40); // 39.6 rounds up to 40
});

test("combineConditions requires at least 2 bilateral-marked ratings to apply the bonus", () => {
  const result = combineConditions([{ rating: 20, bilateral: true }, { rating: 10 }]);
  assert.equal(result.bilateralCombinedRaw, null);
  // Falls back to treating the lone "bilateral" rating as a normal one.
  assert.equal(result.combinedRounded, roundToNearestTen(combineRatingsRaw([20, 10])));
});

test("combineConditions mixes a bilateral pair with other ratings correctly", () => {
  // Two bilateral 20s (-> 39.6) combined with an unrelated 50.
  const result = combineConditions([
    { rating: 20, bilateral: true },
    { rating: 20, bilateral: true },
    { rating: 50 },
  ]);
  const expectedRaw = combineRatingsRaw([50, 39.6]);
  assert.ok(Math.abs(result.combinedRaw - expectedRaw) < 1e-9);
  assert.equal(result.combinedRounded, roundToNearestTen(expectedRaw));
});

test("combineConditions ignores 0% (non-compensable) ratings", () => {
  const withZero = combineConditions([{ rating: 50 }, { rating: 0 }]);
  const withoutZero = combineConditions([{ rating: 50 }]);
  assert.equal(withZero.combinedRounded, withoutZero.combinedRounded);
});

test("lookupCompensation matches the published veteran-alone and veteran+spouse rates exactly", () => {
  for (const rating of Object.keys(BASE_RATES).map(Number)) {
    assert.equal(lookupCompensation(rating), BASE_RATES[rating].alone);
    if (rating >= 30) {
      assert.equal(lookupCompensation(rating, { hasSpouse: true }), BASE_RATES[rating].spouse);
    }
  }
});

test("lookupCompensation returns 0 for a 0% combined rating", () => {
  assert.equal(lookupCompensation(0), 0);
});

test("lookupCompensation pays the flat rate at 10-20% regardless of dependents", () => {
  const flat = lookupCompensation(20);
  const withEverything = lookupCompensation(20, {
    hasSpouse: true,
    spouseAA: true,
    childrenUnder18: 3,
    childrenInSchool: 2,
    dependentParents: 2,
  });
  assert.equal(flat, withEverything);
});

test("lookupCompensation: first child under 18 uses the childOnly base row, not an additive amount", () => {
  assert.equal(lookupCompensation(30, { childrenUnder18: 1 }), BASE_RATES[30].childOnly);
});

test("lookupCompensation: each additional child under 18 beyond the first uses the flat additive rate", () => {
  const oneChild = lookupCompensation(30, { childrenUnder18: 1 });
  const twoChildren = lookupCompensation(30, { childrenUnder18: 2 });
  assert.ok(Math.abs(twoChildren - oneChild - ADDITIONAL_RATES[30].childUnder18) < 1e-9);
});

test("lookupCompensation: dependent parents add a flat per-parent amount on top of the base", () => {
  const alone = lookupCompensation(60);
  const onePar = lookupCompensation(60, { dependentParents: 1 });
  const twoPar = lookupCompensation(60, { dependentParents: 2 });
  assert.ok(Math.abs(onePar - alone - ADDITIONAL_RATES[60].parent) < 1e-9);
  assert.ok(Math.abs(twoPar - alone - 2 * ADDITIONAL_RATES[60].parent) < 1e-9);
});

test("lookupCompensation: spouse Aid & Attendance only applies when a spouse is present", () => {
  const withoutSpouse = lookupCompensation(50, { spouseAA: true });
  const withSpouseNoAA = lookupCompensation(50, { hasSpouse: true });
  const withSpouseAA = lookupCompensation(50, { hasSpouse: true, spouseAA: true });
  assert.equal(withoutSpouse, BASE_RATES[50].alone); // spouseAA ignored, no spouse
  assert.ok(Math.abs(withSpouseAA - withSpouseNoAA - ADDITIONAL_RATES[50].spouseAA) < 1e-9);
});

test("lookupCompensation rejects a rating that isn't a multiple of 10", () => {
  assert.throws(() => lookupCompensation(35), RangeError);
});
