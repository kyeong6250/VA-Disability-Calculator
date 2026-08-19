import { combineConditions, lookupCompensation } from "./calc.js";

const conditionsList = document.getElementById("conditions-list");
const addConditionBtn = document.getElementById("add-condition");
const statCount = document.getElementById("stat-count");
const statRaw = document.getElementById("stat-raw");
const statBilateral = document.getElementById("stat-bilateral");
const combinedRatingEl = document.getElementById("combined-rating");
const monthlyPayEl = document.getElementById("monthly-pay");
const toggleMathBtn = document.getElementById("toggle-math");
const breakdownEl = document.getElementById("breakdown");

const toggleSpouse = document.getElementById("toggle-spouse");
const spouseAARow = document.getElementById("spouse-aa-row");
const toggleSpouseAA = document.getElementById("toggle-spouse-aa");

const childrenU18Value = document.getElementById("children-u18");
const childrenSchoolValue = document.getElementById("children-school");
const parentsValue = document.getElementById("dependent-parents");

const state = {
  conditions: [
    { id: 0, rating: 50, bilateral: false },
    { id: 1, rating: 20, bilateral: false },
  ],
  nextId: 2,
  hasSpouse: false,
  spouseAA: false,
  childrenUnder18: 0,
  childrenInSchool: 0,
  dependentParents: 0,
  showMath: false,
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function createConditionRow(condition, index) {
  const row = document.createElement("div");
  row.className = "condition-row";

  const head = document.createElement("div");
  head.className = "condition-row-head";

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = `Condition ${index + 1}`;

  const right = document.createElement("div");
  right.className = "right";

  const ratingValue = document.createElement("span");
  ratingValue.className = "rating-value";
  ratingValue.textContent = `${condition.rating}%`;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "icon-btn";
  removeBtn.setAttribute("aria-label", "Remove condition");
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", () => {
    state.conditions = state.conditions.filter((c) => c.id !== condition.id);
    renderConditions();
  });

  right.append(ratingValue, removeBtn);
  head.append(label, right);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "va-slider";
  slider.min = "10";
  slider.max = "100";
  slider.step = "10";
  slider.value = String(condition.rating);
  slider.setAttribute("aria-label", `Condition ${index + 1} rating percentage`);
  // Update the rating in place (not a full re-render) so dragging the thumb
  // doesn't destroy and recreate the slider element mid-drag.
  slider.addEventListener("input", (e) => {
    condition.rating = parseInt(e.target.value, 10);
    ratingValue.textContent = `${condition.rating}%`;
    updateResults();
  });

  const bilateralLabel = document.createElement("label");
  bilateralLabel.className = "bilateral-label";

  const toggle = document.createElement("div");
  toggle.className = `toggle ${condition.bilateral ? "on" : "off"}`;
  const knob = document.createElement("div");
  knob.className = "knob";
  toggle.appendChild(knob);
  toggle.addEventListener("click", () => {
    condition.bilateral = !condition.bilateral;
    toggle.className = `toggle ${condition.bilateral ? "on" : "off"}`;
    updateResults();
  });

  bilateralLabel.append(toggle, document.createTextNode(" Bilateral (paired limb)"));

  row.append(head, slider, bilateralLabel);
  return row;
}

function renderConditions() {
  conditionsList.innerHTML = "";
  state.conditions.forEach((c, i) => conditionsList.appendChild(createConditionRow(c, i)));
  updateResults();
}

function readDeps() {
  return {
    hasSpouse: state.hasSpouse,
    spouseAA: state.spouseAA,
    childrenUnder18: state.childrenUnder18,
    childrenInSchool: state.childrenInSchool,
    dependentParents: state.dependentParents,
  };
}

function buildBreakdown(conditions, result, deps, pay) {
  const lines = [];
  const fmt = (n) => Math.round(n * 100) / 100;

  if (result.bilateralGroup.length >= 2) {
    lines.push(
      `Bilateral group (${result.bilateralGroup.map((r) => r + "%").join(", ")}) combines to ${fmt(
        result.bilateralCombinedRaw
      )}%, then +10% bilateral bonus → ${fmt(result.bilateralAdjusted)}%.`
    );
  } else if (result.bilateralGroup.length === 1) {
    lines.push("Only one condition was marked bilateral, so no pairing bonus applies.");
  }

  const nonBilateralCount = conditions.filter((c) => c.rating > 0 && !c.bilateral).length;
  const totalGroups = nonBilateralCount + (result.bilateralGroup.length >= 2 ? 1 : result.bilateralGroup.length);

  if (totalGroups > 1) {
    lines.push(`Combining all values highest to lowest gives ${fmt(result.combinedRaw)}%.`);
  }

  lines.push(`Rounded to the nearest 10%: <strong>${result.combinedRounded}%</strong>.`);

  if (result.combinedRounded < 30 && result.combinedRounded > 0) {
    lines.push(`At ${result.combinedRounded}%, pay is a flat rate — dependents don't add anything.`);
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
    lines.push(`Monthly pay at ${result.combinedRounded}% for ${parts.join(", ")}: <strong>$${pay.toFixed(2)}</strong>.`);
  }

  return lines;
}

function updateResults() {
  const result = combineConditions(state.conditions);
  const deps = readDeps();
  const pay = lookupCompensation(result.combinedRounded, deps);

  statCount.textContent = String(state.conditions.length);
  statRaw.textContent = state.conditions.length ? `${Math.round(result.combinedRaw * 10) / 10}%` : "—";
  statBilateral.textContent = result.bilateralGroup.length >= 2 ? "+10%" : "—";
  combinedRatingEl.textContent = `${result.combinedRounded}%`;
  monthlyPayEl.textContent = `$${Math.round(pay).toLocaleString()}`;

  // Safe to use innerHTML: every value woven into buildBreakdown()'s lines
  // comes from slider/toggle/stepper state (numbers and fixed strings), not
  // free-text input -- there are no text fields anywhere in this app.
  breakdownEl.innerHTML = buildBreakdown(state.conditions, result, deps, pay)
    .map((l) => `<p>${l}</p>`)
    .join("");
}

function updateSpouseUI() {
  toggleSpouse.className = `toggle ${state.hasSpouse ? "on" : "off"}`;
  toggleSpouseAA.className = `toggle ${state.spouseAA ? "on" : "off"}`;
  spouseAARow.classList.toggle("disabled-row", !state.hasSpouse);
}

addConditionBtn.addEventListener("click", () => {
  state.conditions.push({ id: state.nextId++, rating: 10, bilateral: false });
  renderConditions();
});

toggleSpouse.addEventListener("click", () => {
  state.hasSpouse = !state.hasSpouse;
  if (!state.hasSpouse) state.spouseAA = false;
  updateSpouseUI();
  updateResults();
});

toggleSpouseAA.addEventListener("click", () => {
  if (!state.hasSpouse) return;
  state.spouseAA = !state.spouseAA;
  updateSpouseUI();
  updateResults();
});

toggleMathBtn.addEventListener("click", () => {
  state.showMath = !state.showMath;
  breakdownEl.classList.toggle("hidden", !state.showMath);
  toggleMathBtn.textContent = state.showMath ? "Hide the math" : "Show the math";
});

document.getElementById("dec-children-u18").addEventListener("click", () => {
  state.childrenUnder18 = clamp(state.childrenUnder18 - 1, 0, 10);
  childrenU18Value.textContent = String(state.childrenUnder18);
  updateResults();
});
document.getElementById("inc-children-u18").addEventListener("click", () => {
  state.childrenUnder18 = clamp(state.childrenUnder18 + 1, 0, 10);
  childrenU18Value.textContent = String(state.childrenUnder18);
  updateResults();
});

document.getElementById("dec-children-school").addEventListener("click", () => {
  state.childrenInSchool = clamp(state.childrenInSchool - 1, 0, 10);
  childrenSchoolValue.textContent = String(state.childrenInSchool);
  updateResults();
});
document.getElementById("inc-children-school").addEventListener("click", () => {
  state.childrenInSchool = clamp(state.childrenInSchool + 1, 0, 10);
  childrenSchoolValue.textContent = String(state.childrenInSchool);
  updateResults();
});

document.getElementById("dec-parents").addEventListener("click", () => {
  state.dependentParents = clamp(state.dependentParents - 1, 0, 2);
  parentsValue.textContent = String(state.dependentParents);
  updateResults();
});
document.getElementById("inc-parents").addEventListener("click", () => {
  state.dependentParents = clamp(state.dependentParents + 1, 0, 2);
  parentsValue.textContent = String(state.dependentParents);
  updateResults();
});

updateSpouseUI();
renderConditions();
