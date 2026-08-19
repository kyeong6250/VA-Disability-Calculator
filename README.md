# VA Disability Calculator

A small static web app that combines multiple VA disability ratings the way
the VA actually does it (not simple addition) and estimates 2026 monthly
compensation. No build step, no framework, no dependencies.

Live at: https://kyeong6250.github.io/VA-Disability-Calculator/

## Why not just add the percentages?

The VA doesn't add ratings together. A 50% rating and a 20% rating isn't
70% — it's 60%. Each rating is applied to whatever efficiency you have
*left*, not to the raw total, and disabilities affecting paired limbs (both
arms, both legs) get an extra 10% bonus before everything else combines.
This tool does that math for you and shows every step, then looks up the
actual dollar amount for your combined rating and dependents.

## Using it

1. Add each rated condition and drag its slider to the percentage. Toggle
   "Bilateral" for a condition that's one of a matching pair (e.g. left knee
   and right knee both rated).
2. Fill in dependents in the side panel — spouse, children, dependent
   parents. This only changes pay at 30% or higher; below that it's a flat
   rate (the "Spouse Aid & Attendance" toggle only does anything once a
   spouse is set).
3. Read the combined rating and estimated monthly payment, and hit "Show
   the math" to see exactly how it was computed.

## What it does and doesn't cover

Covers: combining any number of ratings with the bilateral factor, and
monthly compensation for a spouse, children (under 18 and 18+ in school),
dependent parents, and a spouse receiving Aid & Attendance.

Doesn't cover: Special Monthly Compensation (SMC), Individual
Unemployability (TDIU), retroactive/back pay, or CRSC/CRDP for military
retirees. Those have their own rules this tool doesn't model — see
[va.gov](https://www.va.gov/disability/) for those.

This is an independent tool, not affiliated with or endorsed by the VA.
Verify your exact amount at
[va.gov/disability/compensation-rates/veteran-rates](https://www.va.gov/disability/compensation-rates/veteran-rates/)
before relying on it for anything financial.

## The math, precisely

**Combining ratings** (38 CFR § 4.25): sort ratings highest to lowest.
Starting from 100% efficiency, each rating is applied to whatever's left,
not the original total:

```
100% efficiency
- 50% rating  ->  50% remaining (added 50)
- 20% rating  ->  50% x 20% = 10% used  ->  40% remaining (running total 60)
- 10% rating  ->  40% x 10% = 4% used   ->  36% remaining (running total 64)
Combined: 64%, rounded to the nearest 10% -> 60%
```

Rounding: anything ending in .0-.4 rounds down, .5-.9 rounds up (64 -> 60,
65 -> 70).

**Bilateral factor** (38 CFR § 4.26): if two or more ratings are marked
bilateral, they're combined among themselves *first* (using the same
method above, unrounded), then 10% of that combined value is added on top.
The result is treated as a single rating and combined with everything else
in the normal highest-to-lowest order. Only the final combined rating gets
rounded.

**Compensation**: base household rate (veteran alone / + spouse / + spouse
and first child / + first child only, no spouse) for the combined rating,
plus a flat per-tier amount for each additional dependent — children under
18 beyond the first, children 18+ in school, dependent parents, and spouse
Aid & Attendance. See [`calc.js`](calc.js) for the exact 2026 figures (2.8%
COLA, effective 2025-12-01) and where each one was verified against
va.gov's published tables.

## Development

Pure ES modules, zero dependencies.

```sh
node --test tests/
# or
npm test
```

`calc.js` has no DOM dependency, so the same module is imported directly by
`script.js` in the browser and by the test suite in Node — no build/bundle
step, no risk of the tested logic drifting from what actually ships.

To preview locally:

```sh
python -m http.server 8000
# then open http://localhost:8000
```
