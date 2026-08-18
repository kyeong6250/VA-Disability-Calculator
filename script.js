import { combineConditions, lookupCompensation, VALID_RATINGS } from "./calc.js";

const conditionsList = document.getElementById("conditions-list");
const addConditionBtn = document.getElementById("add-condition");
const hasSpouseEl = document.getElementById("has-spouse");
const spouseAAEl = document.getElementById("spouse-aa");
const spouseAARow = document.getElementById("spouse-aa-row");
const childrenUnder18El = document.getElementById("children-under-18");
const childrenInSchoolEl = document.getElementById("children-in-school");
const dependentParentsEl = document.getElementById("dependent-parents");
const combinedRatingEl = document.getElementById("combined-rating");
const monthlyPayEl = document.getElementById("monthly-pay");
const breakdownEl = document.getElementById("breakdown");

const RATING_OPTIONS = VALID_RATINGS.filter((r) => r > 0);
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

let nextRowId = 0;

function addConditionRow(initialRating = 10) {
  const id = `condition-${nextRowId++}`;
  const row = document.createElement("div");
  row.className = "condition-row";
  row.dataset.id = id;

  const select = document.createElement("select");
  select.setAttribute("aria-label", "Rating percentage");
  for (const rating of RATING_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = String(rating);
    opt.textContent = `${rating}%`;
    if (rating === initialRating) opt.selected = true;
    select.appendChild(opt);
  }

  const bilateralLabel = document.createElement("label");
  bilateralLabel.className = "checkbox-row bilateral-row";
  const bilateralCheckbox = document.createElement("input");
  bilateralCheckbox.type = "checkbox";
  bilateralLabel.append(bilateralCheckbox, " Bilateral (paired limb)");

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn-remove";
  removeBtn.textContent = "Remove";
  removeBtn.setAttribute("aria-label", "Remove condition");
  removeBtn.addEventListener("click", () => {
    row.remove();
    recalculate();
  });

  select.addEventListener("change", recalculate);
  bilateralCheckbox.addEventListener("change", recalculate);

  row.append(select, bilateralLabel, removeBtn);
  conditionsList.appendChild(row);
  recalculate();
}

function readConditions() {
  return [...conditionsList.querySelectorAll(".condition-row")].map((row) => {
    const rating = Number(row.querySelector("select").value);
    const bilateral = row.querySelector("input[type=checkbox]").checked;
    return { rating, bilateral };
  });
}

function readDependents() {
  return {
    hasSpouse: hasSpouseEl.checked,
    spouseAA: spouseAAEl.checked,
    childrenUnder18: Math.max(0, Number(childrenUnder18El.value) || 0),
    childrenInSchool: Math.max(0, Number(childrenInSchoolEl.value) || 0),
    dependentParents: Math.max(0, Number(dependentParentsEl.value) || 0),
  };
}

function renderBreakdown(conditions, result, deps, pay) {
  const lines = [];

  if (result.bilateralGroup.length >= 2) {
    lines.push(
      `Bilateral group (${result.bilateralGroup.map((r) => r + "%").join(", ")}) combines to ` +
        `${fmt(result.bilateralCombinedRaw)}%, then +10% bilateral bonus &rarr; ${fmt(result.bilateralAdjusted)}%.`
    );
  } else if (result.bilateralGroup.length === 1) {
    lines.push(`Only one condition was marked bilateral, so no pairing bonus applies.`);
  }

  const nonBilateralCount = conditions.filter((c) => c.rating > 0 && !c.bilateral).length;
  const totalGroups =
    nonBilateralCount + (result.bilateralGroup.length >= 2 ? 1 : result.bilateralGroup.length);

  if (totalGroups > 1) {
    lines.push(
      `Combining all values highest to lowest (each rating applies to what's left, not the raw total) gives ${fmt(
        result.combinedRaw
      )}%.`
    );
  }

  lines.push(`Rounded to the nearest 10%: <strong>${result.combinedRounded}%</strong>.`);

  if (result.combinedRounded < 30 && result.combinedRounded > 0) {
    lines.push(`At ${result.combinedRounded}%, pay is a flat rate &mdash; dependents don't add anything.`);
  } else if (result.combinedRounded >= 30) {
    const parts = [];
    if (deps.hasSpouse && deps.childrenUnder18 > 0) parts.push("spouse + first child under 18");
    else if (deps.hasSpouse) parts.push("spouse");
    else if (deps.childrenUnder18 > 0) parts.push("first child under 18");
    else parts.push("veteran alone");
    if (deps.childrenUnder18 > 1) parts.push(`${deps.childrenUnder18 - 1} additional child(ren) under 18`);
    if (deps.childrenInSchool > 0) parts.push(`${deps.childrenInSchool} child(ren) 18+ in school`);
    if (deps.dependentParents > 0) parts.push(`${deps.dependentParents} dependent parent(s)`);
    if (deps.hasSpouse && deps.spouseAA) parts.push("spouse Aid & Attendance");
    lines.push(`Monthly pay at ${result.combinedRounded}% for ${parts.join(", ")}: <strong>${currency.format(pay)}</strong>.`);
  }

  // innerHTML is safe here: every value interpolated above comes from a
  // <select> constrained to VALID_RATINGS or a number input coerced through
  // Number()/Math.max() -- there are no free-text fields anywhere in this
  // app, so nothing attacker-controlled ever reaches this string.
  breakdownEl.innerHTML = lines.map((l) => `<p>${l}</p>`).join("");
}

function fmt(n) {
  return Math.round(n * 100) / 100;
}

function recalculate() {
  const conditions = readConditions();
  const deps = readDependents();

  spouseAAEl.disabled = !deps.hasSpouse;
  spouseAARow.classList.toggle("disabled", !deps.hasSpouse);
  if (!deps.hasSpouse) spouseAAEl.checked = false;

  const result = combineConditions(conditions);
  const pay = lookupCompensation(result.combinedRounded, deps);

  combinedRatingEl.textContent = `${result.combinedRounded}%`;
  monthlyPayEl.textContent = currency.format(pay);
  renderBreakdown(conditions, result, deps, pay);
}

addConditionBtn.addEventListener("click", () => addConditionRow());
[hasSpouseEl, spouseAAEl, childrenUnder18El, childrenInSchoolEl, dependentParentsEl].forEach((el) =>
  el.addEventListener("input", recalculate)
);

// Start with two rows -- a combined-rating calculator with only one row
// isn't very useful, and this nudges people toward the common case.
addConditionRow(50);
addConditionRow(20);
