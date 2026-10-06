# ADR-001: Integrate Vigil into the Analog dashboard as a co-hosted suite

**Status:** Accepted
**Date:** 2026-10-06
**Deciders:** Harsh (Analog project), Sidhant (Vigil project)

## Context

Two motor fault detection projects exist side by side:

- **Analog** (`D:\clg\projects sem3\Analog`): Next.js 16 dashboard plus a Python WebSocket backend. It models a small DC motor, an analog current-sensing front-end (shunt, LM358 diff amp, Sallen-Key filter, Arduino ADC) and a Random Forest classifier. Pages: `/`, `/lab` (3D), `/how`.
- **Vigil** (`D:\clg\sidhant`): Next.js 16, fully in-browser TypeScript. It models a 1.5 kW induction motor, an embedded controller (ADC, DMA, RTOS, DSP, rule-based classifier, Modbus) and a 3D bench, with a presentation mode. Pages: `/`, `/control-room`, `/firmware`, `/present`.

Both use the same Next, React, three.js and r3f versions. Each has its own polished design system, and the two systems conflict: different fonts, different Tailwind `@theme` tokens, a dark-only theme vs a light+dark theme, and different `<html>` attributes. The demo is a college viva, so it must work offline and must not break.

## Decision

Option A: run both in **one Next app**, using **route groups with separate root layouts**:

- `app/(analog)/…` keeps `/`, `/lab`, `/how` with the Analog layout and `globals.css`.
- `app/(vigil)/vigil/…` serves `/vigil`, `/vigil/control-room`, `/vigil/firmware`, `/vigil/present` with Vigil's own layout and CSS.
- Vigil source lives under `dashboard/vigil/` and is imported through an `@vigil/*` path alias. Its internal links are rewritten to the `/vigil` prefix.
- Both navs get a suite switcher (Analog + AI ⇄ Embedded firmware) so the site reads as one project with two subsystems.

## Options Considered

### Option A: Co-host via route groups (chosen)
| Dimension | Assessment |
|---|---|
| Complexity | Low: mostly mechanical moves and import rewrites |
| Risk | Low: each app keeps its own CSS and layout; Vigil's headless sim tests still run |
| Effort | Hours |
| Offline | Yes: fonts come from npm (`@fontsource`), there are no CDN assets |

**Pros:** both designs survive intact. One URL and one `npm run dev`. Easy to roll back.
**Cons:** switching suites does a full page reload. There are two visual languages. Two motors (DC vs induction) are not physically the same rig.

### Option B: Port Vigil features into Analog's design
| Dimension | Assessment |
|---|---|
| Complexity | High: about 12.7k lines to restyle and adapt to one channel on an Arduino Uno |
| Risk | High: regressions in a polished, tested simulator |

**Pros:** one consistent look. **Cons:** weeks of work, and it throws away a finished design.

### Option C: Data-level merge
Feed Vigil's current channel into the Analog front-end and Random Forest, or Analog data into Vigil's firmware.
**Cons:** the motors' physics differ (0.3 A DC vs 4.2 A three-phase). The Random Forest is trained on DC-motor features. The result would be scientifically dishonest without retraining and a new front-end design.

### Option D: Separate apps, cross-linked
**Pros:** zero code change. **Cons:** two servers and two ports. It reads as two projects, not one.

## Trade-off Analysis

A buys about 90% of the value of B (one site, one story, one demo) at about 5% of the cost and risk. C sounds appealing but would misrepresent the engineering. D is what A collapses to if the merge ever has to be undone.

## Consequences

- Easier: one dev server and one deploy. The viva can walk from sensing (Analog) to firmware (Vigil) to AI.
- Harder: two design systems to maintain. Shared UI must not be assumed across suites.
- Revisit: a real data bridge (Option C) once real hardware data exists for both motors.

## Action Items

1. [x] Move Analog pages into `app/(analog)`.
2. [x] Copy Vigil into `dashboard/vigil`, rewrite imports to `@vigil/*`, and prefix links with `/vigil`.
3. [x] Install Vigil's runtime dependencies (`@fontsource-variable/*`, `clsx`, `lucide-react`, `motion`) and `tsx` for its sim tests.
4. [x] Add the suite switcher to both navs.
5. [x] Fix the root git repo: `dashboard/` was committed as a gitlink (nested `.git`), so its source was not in the repo. The nested `.git` was moved to `../Analog-dashboard-git-backup` and `dashboard/` is now tracked as plain files.
