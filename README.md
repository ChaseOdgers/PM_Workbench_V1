# Agentic PM Workbench · V1

A working V1 of the Agentic PM Workbench, built from the AA concept demo and the V1 brief. It runs on mock data only. It covers the core loop:

**sign in by role → connect context → agents raise signals → shape an opportunity → prototype with the team → clear gates → hand off to engineering**

Everything is clickable and saves its state. You can promote a signal, approve a gate, upload a prototype, or push a handoff, and the change sticks until you reset the demo.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

The build is a static site with no server or API keys, so it runs from GitHub Pages. `.github/workflows/deploy.yml` publishes it on every push to `main`. One-time setup: **Settings → Pages → Source: GitHub Actions**.

## Demo script (about 10 minutes)

| # | Sign in as | Do this | Shows |
|---|---|---|---|
| 1 | **Product Manager** (Sam) | Signals: read the "Why #1" line, open **See records**, drag the **Cap** slider | Ranked, capped, explainable signals |
| 2 | PM | **Promote** "Competitor launched a fare-lock feature" | Signal → agent-drafted opportunity |
| 3 | PM | Open **OPP-2271 → Open prototype studio**. Click "Show the all-in price…", then "Auto-book the cheapest alternate" | Versions, scan, the agent refusing a DOT violation |
| 4 | PM | Upload `public/samples/alt-offer-v4-colleague.html` (the **Sample file** link) | A colleague's edit is scanned and blocked |
| 5 | PM | Select the clean version, **Approve vN** | Approved prototype for handoff |
| 6 | **Reviewer** (Priya) | Review queue → approve the DOT and PCI gates with a comment | Human approval on governance gates |
| 7 | **Director** (Jordan) | Lands on **Portfolio**: every value stream, what needs attention. Click a stream to work in it. On OPP-2271, **Approve opportunity → Hand off → Push to ADO** | Cross-stream portfolio; handoff brief becomes an epic plus stories |
| 8 | **Workspace Admin** (Alex) | Context & agents → **Add source** (watch it connect and sync), pause an agent; Governance → **Create gate**; Users & roles | Admin setup flows |

**Reset demo data** is on the sign-in screen (sign out to get there).

## How it works

```
src/
  data/packs/aa/     Mock data pack: one JSON file per data type (users, streams, sources, agents,
                     signals, opportunities, policies, gates, prototypes, raw records…)
  api/db.js          The mock database: loads a pack and saves it to localStorage
  api/index.js       The API every screen calls (async). Swap these for fetch() calls to a real backend
  lib/ranking.js     Signal ranking rules: volume, trend, reach, strategic fit → score, severity, "why"
  lib/gates.js       Which gates an opportunity triggers, its status, and handoff readiness
  lib/scan.js        Governance scan of prototype HTML (forbid / require / accessible-label checks)
  lib/prototype.js   Prototype generator + the scripted chat agent
  lib/perms.js       One permissions table for the four roles
  screens/           One file per screen
scripts/generate-raw-records.mjs   Regenerates the ~270 raw records (support contacts, feedback, web items)
```

**What's real vs mocked in V1**

| Real (works end to end) | Mocked (shown as a workflow) |
|---|---|
| Role-based access, value-stream scoping | SSO (persona picker stands in for IBM Verify / Okta / Entra) |
| Signal scoring from visible rules; mute, cap, promote, link | Connectors (simulated handshake and sync) |
| Gate triggering from opportunity text and evidence; reviews and comments; gate log | Agent schedules and runs (a run is logged, nothing runs on a timer) |
| Prototype versions, governance scan, upload, approve | Chat agent is scripted (layout, pricing, accessibility, theme edits). M3 adds a live model call |
| Handoff brief generation, editing, Markdown download | "Push to ADO/Jira" writes mock work items, not a real API |
| Full audit trail | Share links only work in the browser that created them (no backend) |

**Adding a client pack (FedEx, UPS…):** copy `src/data/packs/aa/` to a new folder, change the content and brand colors in `workspace.json`, and run `node scripts/generate-raw-records.mjs <pack>` after editing its themes. Packs are picked up automatically. Switching the active pack is a one-line call: `resetDemo("fedex")`.

## Maps to the V1 brief

- **Design call 1:** Intent layer and Agent runs are merged into **Context & agents** (Sources / Agents / Notes tabs). Each source shows the agent that reads it and its schedule.
- **Design call 2:** Signals are ranked by visible, editable rules, with a cap and an "Everything else" list.
- **Design call 3:** Governance is three objects: policies, gates (trigger + approver + flag/block), and the log.
- **Design call 4:** There is no spec screen. The agent drafts a **handoff brief** that pushes as an epic.
- **Design call 5:** The prototype studio runs the loop: generate → share → feedback → next version → scan → approve.
- **Deferred to V2:** Telemetry, Roadmap/Aha, value and risk models, forecasts, global search, notifications.

## Next

- M2: a FedEx pack and a fake HTTP API (`json-server` or a small Express app) behind `src/api/index.js`.
- M3: one live agent. The signals agent reads the mock tickets and ranks themes with a real model call through a serverless function.
