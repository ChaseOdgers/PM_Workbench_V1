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

## Fresh workspace demo (empty instance → API → signals → agent → opportunity)

A second instance of the same app that starts empty: the org is set up (users, value streams, governance, the theme library, the core agents) but there are no sources, signals or opportunities. It runs on its own port with its own saved data, so the full demo on 5173 is untouched, and it uses the same mock enterprise API.

```bash
npm run mock-api      # terminal 1: the mock enterprise API on :4010
npm run dev:fresh     # terminal 2: the empty workspace on http://localhost:5174
npm run dev           # (optional) terminal 3: the full demo on http://localhost:5173
```

**Script (about 5 minutes, as the Director, Jordan):**

| # | Do | What it shows |
|---|---|---|
| 1 | Sign in as **Director (Jordan)**. Portfolio, Signals and Opportunities are empty; a **Getting started** card shows four steps | What a new workspace looks like |
| 2 | **Context & agents → Add source → REST API (any endpoint)**. Under "Or pick from the mock enterprise API" click **Show endpoints**, then **salesforce/cases** | Any existing API: the Workbench finds 518 records, shows a preview and guesses the field mapping. No connector code |
| 3 | Keep **Have an agent watch this source** on (every 15 seconds, 10 new records), then **Connect and watch** | The API becomes a source; its records become signals (10 themes) |
| 4 | **Signals** | Ranked signals from the API's data |
| 5 | **Context & agents → Agents**: the **Watcher agents** card. Its first check records a baseline; the countdown shows the next check | An agent monitoring the source |
| 6 | In a terminal: `npm run surge -- wifi 30` | 30 new complaints arrive in "Salesforce", about a theme the app has never seen |
| 7 | Within one check: a green **Opportunity drafted** pop-up. Click it | The agent spotted the spike, discovered the new theme and drafted OPP-3001 in Sense, grounded in the 30 records |
| 8 | Optional: `npm run surge -- pets 15` (drafts another), then `npm run surge -- wifi 12` | A known theme spikes; more evidence on an existing theme is added, not duplicated |

Reset between runs: `npm run surge -- reset` (mock API back to the files on disk) and **Reset demo data** on the sign-in screen (empties the workspace again).

How it works: `src/lib/rest.js` finds the list of records in any JSON response, flattens nested fields and guesses the mapping; rows go through the same theming and signal pipeline as file imports. Watcher agents (`runWatcher` in `src/api/index.js`) poll their sources on a schedule while the app is open, compare per-theme counts with the last check, and draft an opportunity when a theme gets N+ new records (or, optionally, keeps growing), unless an open opportunity already covers it. In a client build the scheduler runs server-side. The mock API's demo controls (`/v1/_demo/surge`, `/v1/_demo/reset`, `MOCK_DRIP=1`) are in `mock-api/server.mjs`.

## Mock enterprise API (data outside the front end)

Customer records and metrics aren't bundled in the app. They live in `mock-api/` and are served over HTTP like real systems:

| System | Endpoint | Shape |
|---|---|---|
| Salesforce Service Cloud | `/v1/salesforce/cases.json` | SOQL result: `records[]` with CaseNumber, Description, Origin, Reason, Account tier |
| Booking assistant (chatbot) | `/v1/chatbot/conversations.json` | `conversations[]` with first customer message and outcome |
| Medallia | `/v1/medallia/responses.json` | `data[]` with LTR score, comment, touchpoint |
| App Store + Google Play | `/v1/appstore/reviews.json` | `reviews[]` with rating, content, version |
| Cargo ops | `/v1/cargo/exceptions.json` | `items[]` per air waybill |
| Ops event bus | `/v1/ops/disruptions.json` | `events[]` delays and cancellations |
| Adobe Analytics, Snowflake | `/v1/adobe/metrics.json`, `/v1/snowflake/kpis.json` | 12 weekly values per metric |

- **Hosted (default):** the committed snapshot on GitHub, `https://raw.githubusercontent.com/ChaseOdgers/PM_Workbench_V1/main/mock-api/static`. Nothing to run.
- **Local server:** `npm run mock-api` serves the same data on `http://localhost:4010` with `?since=`, `?limit=`, `?offset=`, an optional key (`MOCK_API_KEY=…`, sent as `x-api-key`) and latency (`LATENCY_MS=…`). Switch to it in **Context & agents → Enterprise systems → Endpoint**.
- **Regenerate:** `npm run mock-data` (seeded, so the same every time). Edit `SAY` and `PLAN` in `mock-api/generate.mjs` to plant new stories.

On load the Workbench syncs every API-backed source (Salesforce, Medallia, …). Each connector (`src/lib/enterprise.js`) maps its system's shape into records, the signals agent themes them, signals are raised or corroborated, and weekly metrics update the signal they measure. Opportunities seeded with `themeKeys` link to their signals as the data arrives, and each opportunity shows **Where this comes from**: every system, its endpoint, the record count, sample records with their source IDs, and the metric series.

## Demo script (about 10 minutes)

| # | Sign in as | Do this | Shows |
|---|---|---|---|
| 1 | **Product Manager** (Sam) | Signals: read the "Why #1" line, open **See records**, drag the **Cap** slider | Ranked, capped, explainable signals |
| 2 | PM | **Promote** "Competitor launched a fare-lock feature" | Signal → agent-drafted opportunity |
| 3 | PM | Open **OPP-2271 → Open prototype studio**. Click "Show the all-in price…", then "Auto-book the cheapest alternate" | Versions, scan, the agent refusing a DOT violation |
| 4 | PM | Upload `public/samples/alt-offer-v4-colleague.html` (the **Sample file** link) | A colleague's edit is scanned and blocked |
| 5 | PM | Select the clean version, **Approve vN** | Approved prototype for handoff |
| 6 | **Reviewer** (Priya) | Review queue → approve the DOT and PCI gates with a comment | Human approval on governance gates |
| 0a | **PM** (Sam) | Opportunities → **Board**: every phase has work. Open OPP-2290 and read the checklist: Scope and Consult tasks, compliance already done by Priya with a note, engineering assigned to Raj. Then sign in as **Engineering lead** (Raj): his assigned task is on top of Opportunities; mark it done with a size | The checklist is the team's actual process for each phase |
| 0 | **PM** (Sam) | Opportunities → **Board**, open **OPP-2290 Book in-cabin pets online**. Expand Salesforce in **Where this comes from** and open the endpoint link | An opportunity grounded in 136 records from 4 systems plus 2 warehouse/analytics series, all fetched from the mock API |
| 6a | **Admin** (Alex) | Governance → **Phase checklists**: see the org default (Balanced), Customer Care on Fast lane and Baggage on Strict. Pick Reservations → **Customize for this team** → **Strict** → Save. Then as Sam, open OPP-2274: the move to Prototype is locked until its required items and sign-offs are done | Stage gates per phase, configurable per org and per team |
| 6b | PM | On any shaped opportunity, **Draft stories & tests**: edit a story or a Given/When/Then, filter the test scenarios by type, open **Dev readiness**, then **Export → Azure DevOps import (.csv)** | Promoted opportunity → user stories, acceptance criteria, test scenarios, NFRs, DoR/DoD, ready for engineering |
| 7 | **Director** (Jordan) | Lands on **Portfolio**: every value stream, what needs attention. Click a stream to work in it. On OPP-2271, **Approve opportunity → Hand off → Push to ADO** | Cross-stream portfolio; handoff brief becomes an epic plus stories |
| 8 | **Workspace Admin** (Alex) | Context & agents → **Add source** (watch it connect and sync), pause an agent; Governance → **Create gate**; Users & roles | Admin setup flows |
| 9 | Admin | **Add source → File upload**, click the **Support tickets** sample (or drop in your own CSV/JSON export), check the column mapping, **Import** | Real records themed into new and corroborated signals, including emerging themes nobody defined |
| 10 | Admin | **Add source →** each live feed: **Federal Register**, **News search**, **Hub weather**, **Traveler questions**, **Social posts**. Switch to Signals (try Customer Care & IROPS for weather) | Live public data pulled from the browser and ranked next to the pack's signals |
| 11 | Admin | **Add source → Google Sheet or CSV/JSON link**: paste a sheet shared "anyone with the link", import, edit the sheet, hit **refresh** on the source | A living source: change the sheet, the signals change |

**Reset demo data** is on the sign-in screen (sign out to get there).

## How it works

```
src/
  data/packs/aa/     Mock data pack: one JSON file per data type (users, streams, sources, agents,
                     signals, opportunities, policies, gates, prototypes, raw records…)
  api/db.js          The mock database: loads a pack and saves it to localStorage
  api/index.js       The API every screen calls (async). Swap these for fetch() calls to a real backend
  lib/ingest.js      Real data in: CSV/JSON parsing, column guessing, theming (pack themes.json + discovery), weekly trends
  lib/feeds.js       Live public feeds (Federal Register, Hacker News search): fetch + normalize to web items
  lib/ranking.js     Signal ranking rules: volume, trend, reach, strategic fit → score, severity, "why"
  lib/gates.js       Which gates an opportunity triggers, its status, and handoff readiness
  lib/scan.js        Governance scan of prototype HTML (forbid / require / accessible-label checks)
  lib/prototype.js   Prototype generator + the scripted chat agent
  lib/phases.js      Phase checklists: check catalog, Fast / Balanced / Strict presets, org + team rules, evaluation
  lib/delivery.js    Delivery agent: stories, acceptance criteria, test scenarios, NFRs + Markdown / Gherkin / ADO / Jira exports
  lib/perms.js       One permissions table for the four roles
  screens/           One file per screen
mock-api/generate.mjs              Generates the mock enterprise systems' data (npm run mock-data)
mock-api/server.mjs                Serves it locally as an API (npm run mock-api)
scripts/generate-samples.mjs       Regenerates the sample upload files in public/samples/
```

**What's real vs mocked in V1**

| Real (works end to end) | Mocked (shown as a workflow) |
|---|---|
| Role-based access, value-stream scoping | The client's existing SSO (persona picker stands in for it) |
| **File import:** any CSV/JSON export, column mapping, keyword theming, emerging-theme discovery, 8-week trends, new or corroborated signals | Client-system connectors: Salesforce, Snowflake, ADO and the rest (simulated handshake and sync) |
| **Live feeds (no keys):** Federal Register (DOT rules), Hacker News search (news), Open-Meteo (7-day severe weather at hubs), Travel Stack Exchange (traveler questions), Mastodon hashtags (social posts). Called from the browser, re-sync on demand | Feeds don't sync on a timer yet; use the refresh button on the source |
| **Linked sheets:** a Google Sheet or any CSV/JSON URL, re-synced on refresh with the saved column mapping | |
| Signal scoring from visible rules; mute, cap, promote, link | |
| Gate triggering from opportunity text and evidence; reviews and comments; gate log | Agent schedules and runs (a run is logged, nothing runs on a timer) |
| Prototype versions, governance scan, upload, approve | Chat agent is scripted (layout, pricing, accessibility, theme edits). M3 adds a live model call |
| Delivery pack generation (stories, AC, tests, NFRs), editing with autosave, exports that import into ADO and Jira today | "Push to ADO/Jira" writes mock work items, not a real API; the delivery agent is scripted (theme playbooks) until M3 |
| Full audit trail | Share links only work in the browser that created them (no backend) |

**Adding a client pack (FedEx, UPS…):** copy `src/data/packs/aa/` to a new folder, change the content and brand colors in `workspace.json`, edit its `themes.json`, and point `mock-api/generate.mjs` at that client's stories. Packs are picked up automatically. Switching the active pack is a one-line call: `resetDemo("fedex")`.

## Maps to the V1 brief

- **Design call 1:** Intent layer and Agent runs are merged into **Context & agents** (Sources / Agents / Notes tabs). Each source shows the agent that reads it and its schedule.
- **Design call 2:** Signals are ranked by visible, editable rules, with a cap and an "Everything else" list.
- **Design call 3:** Governance is three objects: policies, gates (trigger + approver + flag/block), and the log.
- **Design call 4:** There is no spec screen. The delivery agent drafts a **delivery pack**: user stories (As a / I want / so that) with Given/When/Then acceptance criteria, test scenarios (functional, edge, negative, compliance, accessibility, performance), NFRs, Definition of Ready/Done and open questions, each traced to signals, customer records, the approved prototype and the gates. It pushes as epic → stories → test cases, or exports as Markdown, a Gherkin `.feature` file, or ADO / Jira import CSVs (`lib/delivery.js`).
- **Opportunities in the pack:** the original seven plus five grounded only in the mock API: OPP-2290 in-cabin pets (Reservations), OPP-2291 upgrade-list transparency (Loyalty), OPP-2292 wheelchair assistance (Airport), OPP-2293 offline boarding pass (Airport), OPP-2294 cargo shipment status (Cargo).
- **Phase checklists are the work of each phase.** Org default (Balanced): **Sense → Shape** qualifies the idea (evidence from the data, size it, check the roadmap for overlap, confirm the pain with frontline agents, owner, director agrees). **Shape → Prototype** defines scope (problem, users and success metric; in/out of scope; draft stories) and runs the consults (engineering feasibility and size, compliance on which rules apply, security when payment data is involved, analytics baseline, director approves scope). **Prototype → Handoff** validates (prototype approved, tested with 5+ customers, engineering review and estimates, compliance review of copy, gates, delivery pack, rollout plan, director approval). **Handoff → Delivered** confirms delivery and results (kickoff, sprint, released behind a flag, support briefed, metric instrumented, 30-day review). Tasks are owned by a role (PM, engineering lead, compliance, security, director), can be assigned to a named person, and are marked done with a note. An **Engineering lead** persona (Raj) does the engineering tasks.
- **Seeded pipeline:** Reservations and Customer Care have opportunities in every phase, including handed-off and delivered ones, with tasks already done by different people, open assignments and phase history.
- **Phase checklists (stage gates):** before each move (Sense → Shape → Prototype → Handoff) an opportunity must meet that phase's checklist. Items are automatic checks (linked signals, evidence, problem statement length, goal fit, prototype approved, gates cleared, director approval, delivery pack quality) or sign-offs a named role ticks off. Required items block; nice-to-haves warn. The org sets a default from three presets (Fast lane, Balanced, Strict) and edits it; each value stream inherits it or runs its own. Directors can override with a logged reason when the rules allow, and every move keeps a snapshot of its checklist (`lib/phases.js`, Governance → Phase checklists). Also: data-backed checks (records behind the signals, number of source systems, data freshness, growth); items the org locks so teams can't drop them, or an "only tighten" policy; conditional items (only when a gate triggers, or only for human-created ideas); sign-offs with a note and requests to a named person, which show in their queue; a target time per phase with overdue flags; and a Board view of the pipeline.
- **Design call 5:** The prototype studio runs the loop: generate → share → feedback → next version → scan → approve.
- **Deferred to V2:** Telemetry, Roadmap/Aha, value and risk models, forecasts, global search, notifications.

### How real data becomes a signal

1. **In:** a file is parsed in the browser (nothing is uploaded anywhere), or a feed is fetched. Records land in the same tables as the pack's raw records, tagged with their source.
2. **Theme:** each record is matched against the pack's themes (`themes.json`, keyword rules). Records nothing matches are clustered by shared terms; a term concentrated in at least 6 of them becomes an **emerging theme**. Praise (the top fifth of a rating scale) stays out of discovery. Emerging themes are shared across sources, so "boarding pass" in tickets and in reviews is one signal with two sources.
3. **Signal:** a theme that already has a signal in its value stream gets the new source added as evidence (reach goes up). A theme with no signal gets a new one, with volume = record count and an 8-week trend from the record dates. Disconnecting the source removes its records and the signals it raised.

## Next

- M2: a FedEx pack and a fake HTTP API (`json-server` or a small Express app) behind `src/api/index.js`.
- M3: one live agent. The signals agent reads the mock tickets and ranks themes with a real model call through a serverless function.
