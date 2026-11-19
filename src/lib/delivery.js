// Delivery agent: turns a promoted opportunity into what engineering needs to start work.
// User stories with Given/When/Then acceptance criteria, test scenarios, non-functional
// requirements, Definition of Ready/Done and open questions, each traced back to the signals,
// customer records, prototype and governance gates behind it.
// V1 is scripted (theme templates + rules), like the prototype agent. In M3 a live model call
// replaces draftStories(); the pack shape, editing, exports and push stay the same.

const PERSONA = { res: "traveler booking a trip", care: "traveler whose trip is disrupted", bag: "traveler with a checked bag", loyalty: "AAdvantage member", airport: "traveler at the airport", cargo: "cargo shipper" };

// Each theme: the stories a team would usually cut first, with acceptance criteria and the
// edge cases worth a test. [given, when, then] triples keep this compact.
const LIB = {
  soldout: [
    { title: "See alternatives the moment a fare sells out", iWant: "to see alternate flights, nearby dates and comparable fares as soon as my chosen fare is unavailable", soThat: "I can still book the trip without starting over or leaving for another airline", pri: "Must",
      ac: [["a customer has selected a fare", "the fare sells out before they reach payment", "they see at least three alternate options on the same screen, ranked by closeness to the original"],
           ["no same-day alternative exists", "alternatives load", "nearby dates (±1 day) and the nearest airport options are shown instead"],
           ["alternatives are shown", "the customer picks one", "they return to the booking flow with the new flight, cabin and passengers carried over"]],
      edge: [["Inventory changes while viewing", "an alternate shown to the customer", "it sells out before they choose it", "the list refreshes with a clear message and no error page"],
             ["No alternatives at all", "a route with no seats ±3 days", "the fare sells out", "the customer sees a waitlist / notify-me option and a path to call"],
             ["Alternatives service down", "the alternatives API times out after 2 s", "the fare sells out", "the original sold-out message shows with a retry link; the booking flow is not blocked"]] },
    { title: "Compare an alternate against what I picked", iWant: "to see how each alternate differs from my original choice (time, stops, cabin, price)", soThat: "I can decide quickly", pri: "Should",
      ac: [["alternatives are shown", "the customer views one", "departure difference, stops, cabin and price difference versus the original are visible"]],
      edge: [["Price difference is negative", "an alternate cheaper than the original", "it is displayed", "the difference shows as a saving, not as a negative number"]] },
    { title: "Get notified if my original fare comes back", iWant: "to opt in to an alert if my original flight and fare reopen", soThat: "I don't lose the trip I wanted", pri: "Could",
      ac: [["a customer opted in on a sold-out fare", "a seat at that fare reopens within 72 h", "they get one push or email with a link that holds the fare for 15 minutes"]],
      edge: [["Opted in, then booked an alternate", "the customer booked another flight", "the original reopens", "no alert is sent"]] },
  ],
  payment: [
    { title: "Pre-fill saved traveler details", iWant: "my saved traveler and passport details filled in automatically", soThat: "I don't retype them on every booking", pri: "Must",
      ac: [["a signed-in customer with a saved profile", "they reach the traveler step", "name, date of birth, Known Traveler Number and passport are pre-filled and editable"],
           ["a profile field is out of date (expired passport)", "pre-fill runs", "the field is flagged for review instead of silently submitted"]],
      edge: [["Guest checkout", "a customer who is not signed in", "they reach the traveler step", "the step works as today with an offer to save details after booking"]] },
    { title: "One-tap purchase with a saved card", iWant: "to pay with a saved card in one tap", soThat: "checkout is fast on my phone", pri: "Must",
      ac: [["a saved, unexpired card", "the customer taps Pay", "payment is authorized with the stored token and a confirmation shows within 3 s"],
           ["the saved card is declined", "the customer taps Pay", "a clear decline message shows and they can choose another card without losing the itinerary"]],
      edge: [["Session timeout mid-payment", "the session expires on the payment step", "the customer returns", "the itinerary and traveler details are restored; card details are re-requested"],
             ["Double tap", "the customer taps Pay twice", "the requests reach the server", "only one charge and one booking are created"]] },
  ],
  ancillary: [
    { title: "Offer a seat and bag bundle at checkout", iWant: "to see a relevant seat, bag and boarding bundle before I pay", soThat: "I don't miss options I'd have bought", pri: "Must",
      ac: [["a customer at checkout", "the bundle loads", "one bundle relevant to the route and fare shows, with an itemized all-in price"],
           ["the customer adds the bundle", "they pay", "seat, bag and boarding group appear on the confirmation and itinerary"]],
      edge: [["Basic Economy fare", "a fare that excludes seat selection", "checkout loads", "only allowed items are offered"]] },
  ],
  itinerary: [
    { title: "One itinerary timeline", iWant: "all my trip details in one timeline (flights, connections, seats, bags, changes)", soThat: "I don't piece it together from emails", pri: "Must",
      ac: [["a booked trip", "the customer opens it", "every segment, connection time, seat and bag allowance shows in order"],
           ["a schedule change", "it is applied", "the timeline shows the new time, highlights what changed, and the email matches the app"]],
      edge: [["Multi-PNR trip", "two bookings for one journey", "the customer opens the trip", "the segments are linked or the second booking is clearly referenced"]] },
  ],
  refund: [
    { title: "See my refund eligibility and status", iWant: "to know whether I'm owed a refund and where it stands", soThat: "I don't have to call", pri: "Must",
      ac: [["a flight cancelled or significantly changed under the DOT rule", "the customer opens the trip", "they see that a cash refund is owed and can request it in one step"],
           ["a refund is requested", "it is processed", "status (requested, approved, paid) and expected date are visible"]],
      edge: [["Customer prefers credit", "an eligible customer", "they choose travel credit", "the choice is explicit and they can still change to a refund before it is issued"]] },
  ],
  irops: [
    { title: "See that my trip is disrupted", iWant: "a proactive alert when my flight is delayed or cancelled, with my options", soThat: "I can act before queues form", pri: "Must",
      ac: [["a delay of more than 60 min or a cancellation", "ops publishes the event", "affected customers get a push and email within 5 min linking to their options"]],
      edge: [["Rapid successive delays", "three delay updates in 20 min", "alerts are sent", "the customer gets one consolidated alert, not three"]] },
    { title: "Rebook myself during a disruption", iWant: "to pick a new flight from the protected options myself", soThat: "I don't wait on hold or at the counter", pri: "Must",
      ac: [["an impacted trip", "the customer opens rebooking", "eligible same-day and next-day options are shown with seat availability"],
           ["the customer selects an option", "they confirm", "the new itinerary is ticketed with no fare difference and the old segment is released"],
           ["a weather waiver applies", "the customer views options", "the waiver terms are shown in plain language"]],
      edge: [["Connection partly flown", "the first leg is flown and the connection is cancelled", "the customer rebooks", "only the remaining segments are offered"],
             ["Option taken by another customer", "the last seat on the chosen flight is taken", "the customer confirms", "they see the next best option without losing their place"]] },
  ],
  baggage: [
    { title: "Track my bag end to end", iWant: "to see where my checked bag is at each scan point", soThat: "I know whether it made my flight", pri: "Must",
      ac: [["a checked bag", "it is scanned at check-in, loading, transfer or arrival", "the scan shows on the trip within 5 min"],
           ["the bag missed the flight", "a scan shows it", "the customer is told proactively with the expected flight and delivery option"]],
      edge: [["Missing scans", "no scan for 2 hours on a connection", "the customer checks", "the last known scan and its time are shown, never a guessed location"]] },
    { title: "File a delayed-bag report in the app", iWant: "to report a delayed or damaged bag without queueing", soThat: "the claim starts immediately", pri: "Should",
      ac: [["the bag did not arrive", "the customer files a report", "a file reference is created and the delivery address is captured"]], edge: [] },
  ],
  loyalty: [
    { title: "Upgrade with miles on an existing booking", iWant: "to use miles to request an upgrade on a trip I've already booked", soThat: "I don't have to call", pri: "Must",
      ac: [["an eligible booking and enough miles", "the member requests an upgrade", "miles are held, the request is confirmed and they see their place on the upgrade list"],
           ["the booking is not eligible", "the member opens upgrades", "the reason is shown (fare class, partner flight)"]],
      edge: [["Not enough miles", "a member short of the needed miles", "they request", "they see the shortfall and an option to buy or transfer miles"]] },
  ],
  weather: [
    { title: "Prepare customers for forecast weather", iWant: "to be warned early when severe weather is forecast for my hub", soThat: "I can rebook before the disruption", pri: "Must",
      ac: [["severe weather forecast at a hub within 72 h", "a waiver is issued", "affected customers are notified with free-change options"]], edge: [] },
  ],
};

function genericStories(o, persona) {
  const what = o.title.charAt(0).toLowerCase() + o.title.slice(1);
  return [
    { title: o.title, iWant: what, soThat: "the problem described in this opportunity goes away", pri: "Must",
      ac: [["the situation described in the opportunity", "the customer encounters it", "they can complete their task without contacting support"],
           ["the feature is unavailable or errors", "the customer encounters it", "today's behavior remains and nothing is lost"]],
      edge: [["Service unavailable", "a downstream service is down", "the customer uses the feature", "a friendly fallback shows and the error is logged"]] },
  ];
}

const sizeOf = (s) => (s.ac.length >= 4 ? "L" : s.ac.length >= 2 ? "M" : "S");
const gwt = ([given, when, then]) => ({ given, when, then });

// Gate → extra AC on customer-facing stories, and the compliance tests the gate's checks imply.
const GATE_RULES = {
  "gate-dot": { tag: "DOT", ac: [["any fare or price is displayed", "the customer views it", "it is the all-in price including taxes and carrier-imposed fees"],
    ["an alternate or changed fare is offered", "the customer has not confirmed", "nothing is booked, changed or charged"]],
    tests: [["No booking without explicit consent", "an alternate fare is offered", "the customer navigates away or closes the app without confirming", "no PNR change, ticket or charge exists"],
      ["All-in price everywhere a price shows", "any screen or email that shows a fare", "the page is rendered", "the price includes taxes and fees; no base-fare-only price is visible"]] },
  "gate-pci": { tag: "PCI", ac: [["payment details are entered", "they are submitted", "they are tokenized; no card number is stored or logged by the app"]],
    tests: [["No cardholder data in the browser", "a completed checkout", "browser storage, logs and analytics payloads are inspected", "no PAN, CVV or expiry appears anywhere"],
      ["Tokenization on submit", "a card is entered", "the form is submitted", "only a token reaches our services"]] },
  "gate-acaa": { tag: "ACAA", ac: [["any new control", "a keyboard or screen-reader user reaches it", "it has an accessible name, visible focus and a logical order (WCAG 2.1 AA)"]],
    tests: [["Keyboard-only journey", "a keyboard-only user", "they complete the flow", "every step is reachable and operable without a mouse"],
      ["Screen-reader announcements", "VoiceOver / TalkBack on", "content changes (e.g. a fare sells out)", "the change is announced"],
      ["200% zoom and contrast", "browser zoom at 200%", "the flow is used", "no content is clipped and text contrast is at least 4.5:1"]] },
  "gate-sec": { tag: "Security", ac: [], tests: [["Authorization on every new endpoint", "a signed-in customer", "they call the API for another customer's trip", "the request is refused (403) and logged"]] },
};

export function draftPack({ opp, stream, signals, records, gates, proto, gateReviews = {} }) {
  const persona = PERSONA[opp.streamId] || "customer";
  const keys = [...new Set([opp.template === "alt-offers" ? "soldout" : null, ...signals.flatMap((s) => s.rawKeys || [])].filter(Boolean))];
  let base = keys.flatMap((k) => LIB[k] || []);
  if (!base.length) base = genericStories(opp, persona);
  const gateIds = gates.map((g) => g.id);
  const opts = proto?.options || {};
  const sigIds = signals.map((s) => s.id);
  const quoteFor = (k) => records.find((r) => r.themeKey === k && r.text) || records.find((r) => r.text);

  let n = 0;
  const quoted = new Set();
  const stories = base.slice(0, 6).map((s) => {
    n++;
    const ac = s.ac.map(gwt);
    if (n === 1) {
      if (opts.altPosition === "top") ac.push({ given: "the alternatives are shown", when: "the page loads on mobile and desktop", then: "they appear above the fold, before the sold-out results", src: `prototype v${proto.v}` });
      for (const note of opts.notes || []) ac.push({ given: `the approved prototype v${proto.v}`, when: "this screen is built", then: `the build keeps the reviewed change: “${note.replace(/\.$/, "")}”`, src: `prototype v${proto.v} note` });
    }
    // Gate rules land on the first story (the main customer-facing one); tests cover the rest.
    if (n === 1) for (const gid of gateIds) for (const t of GATE_RULES[gid]?.ac || []) ac.push({ ...gwt(t), src: GATE_RULES[gid].tag });
    const key = Object.keys(LIB).find((k) => LIB[k].includes(s));
    let q = quoteFor(key);
    if (q && quoted.has(q.id)) q = records.find((r) => r.themeKey === key && r.text && !quoted.has(r.id) && r.text !== q.text) || null;
    if (q) quoted.add(q.id);
    return { id: `US-${n}`, title: s.title, asA: persona, iWant: s.iWant, soThat: s.soThat, priority: s.pri, size: sizeOf(s),
      ac: ac.map((a, i) => ({ id: `AC-${n}.${i + 1}`, ...a })), edge: s.edge || [],
      trace: { signals: sigIds, gates: n === 1 ? gateIds.filter((g) => GATE_RULES[g]?.ac.length) : [], proto: n === 1 && proto ? `v${proto.v}` : null },
      quote: q ? { id: q.id, text: q.text } : null };
  });

  const top = signals[0];
  n++;
  stories.push({ id: `US-${n}`, title: "Measure the outcome", asA: "product team", iWant: "the events and a dashboard that show whether this worked", soThat: "we can tell if the bet paid off and feed it back into the Workbench", priority: "Must", size: "S",
    ac: [{ given: "the feature is live", when: "a customer uses it", then: "events fire for view, interaction, completion and abandonment with trip and session IDs" },
      top ? { given: "the baseline for “" + top.theme + "”", when: "the feature has been live for one quarter", then: `the dashboard compares it with today's ${top.volume.toLocaleString()} ${top.unit}` }
        : { given: "a baseline", when: "one quarter after launch", then: "the dashboard compares outcome against the baseline" }]
      .map((a, i) => ({ id: `AC-${n}.${i + 1}`, ...a })), edge: [], trace: { signals: sigIds, gates: [], proto: null }, quote: null });
  n++;
  stories.push({ id: `US-${n}`, title: "Release safely behind a flag", asA: "release manager", iWant: "the feature behind a flag with a staged rollout and a kill switch", soThat: "we can roll back in minutes without a deploy", priority: "Should", size: "S",
    ac: [{ given: "the flag is off", when: "customers use the product", then: "behavior is exactly as today" },
      { given: "a 5% rollout", when: "error rate or conversion moves beyond agreed thresholds", then: "on-call is alerted and the flag can be switched off in under 5 minutes" }]
      .map((a, i) => ({ id: `AC-${n}.${i + 1}`, ...a })), edge: [], trace: { signals: [], gates: gateIds.includes("gate-sec") ? ["gate-sec"] : [], proto: null }, quote: null });

  return { generatedAt: new Date().toISOString(), generator: "Delivery agent (scripted V1)", persona,
    stories, scenarios: buildScenarios(stories, gateIds), nfrs: buildNfrs(gateIds), dor: DOR, dod: buildDod(gateIds),
    questions: buildQuestions(opp, keys, gateIds, gateReviews) };
}

// Every acceptance criterion gets a functional test; edge cases and gate checks add the rest.
export function buildScenarios(stories, gateIds) {
  const out = [];
  let t = 0;
  const add = (x) => out.push({ id: `TC-${String(++t).padStart(2, "0")}`, include: true, ...x });
  for (const s of stories) {
    for (const a of s.ac) add({ storyId: s.id, acId: a.id, type: a.src && GATE_LABELS[a.src] ? "compliance" : "functional", title: cap(a.then.split(/[,;]/)[0]), given: a.given, when: a.when, then: a.then, priority: s.priority === "Must" ? "P1" : "P2", automate: true });
    for (const [title, given, when, then] of s.edge || []) add({ storyId: s.id, type: /down|timeout|times out|unavailable|fail/i.test(title + when) ? "negative" : "edge", title, given, when, then, priority: "P2", automate: !/screen.reader|voiceover/i.test(title) });
  }
  const main = stories[0]?.id;
  for (const g of gateIds) for (const [title, given, when, then] of GATE_RULES[g]?.tests || [])
    add({ storyId: main, type: g === "gate-acaa" ? "accessibility" : "compliance", gate: GATE_RULES[g].tag, title, given, when, then, priority: g === "gate-acaa" ? "P2" : "P1", automate: g !== "gate-acaa" });
  add({ storyId: main, type: "performance", title: "Response time under peak load", given: "peak-hour traffic (3x the average)", when: "the new screens and APIs are exercised", then: "p95 response is under 800 ms and the error rate under 0.5%", priority: "P2", automate: true });
  return out;
}
const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
const GATE_LABELS = { DOT: 1, PCI: 1, ACAA: 1, Security: 1 };

function buildNfrs(gateIds) {
  return [
    "Performance: p95 under 800 ms for new APIs at 3x average peak traffic",
    "Availability: the new path fails open to today's behavior; no new single point of failure in booking",
    "Observability: structured logs, traces and the outcome dashboard live before rollout starts",
    "Privacy: no new customer data stores; data retention follows the existing policy",
    gateIds.includes("gate-acaa") ? "Accessibility: WCAG 2.1 AA on every new screen and email (ACAA)" : "Accessibility: WCAG 2.1 AA on any customer-facing change",
    gateIds.includes("gate-pci") && "Security: PCI-DSS scope unchanged; cardholder data only via the existing tokenization service",
    gateIds.includes("gate-dot") && "Compliance: DOT full-fare advertising and consumer consent rules on every price and booking action",
  ].filter(Boolean);
}
const DOR = ["Story has acceptance criteria in Given/When/Then", "Designs linked (approved prototype version)", "Dependencies and owning teams named", "Test scenarios drafted and reviewed with QA", "Sized by the team"];
function buildDod(gateIds) {
  return ["All acceptance criteria pass in automated tests where marked", "P1 test scenarios pass in staging", "Outcome events visible on the dashboard", "Feature flag and rollback verified",
    ...gateIds.map((g) => GATE_RULES[g] && `${GATE_RULES[g].tag} gate evidence attached to the release`).filter(Boolean), "Release notes and support FAQ updated"];
}
function buildQuestions(opp, keys, gateIds, reviews) {
  const q = [];
  if (keys.includes("soldout")) q.push("Which inventory and pricing services return alternates, and what is their latency at peak?", "How many alternates do we show, and how are they ranked?");
  if (keys.includes("irops")) q.push("Which waiver rules can be applied automatically versus needing an agent?");
  if (keys.includes("payment")) q.push("Does the tokenization service support one-tap reuse on mobile web as well as the app?");
  if (keys.some((k) => k.startsWith("new-"))) q.push("Emerging themes came from imported data: confirm the problem with Customer Care before sizing.");
  for (const g of gateIds) { const c = (reviews[g]?.comments || []).slice(-1)[0]; if (c?.text) q.push(`Reviewer note on ${GATE_RULES[g]?.tag || g}: “${c.text}”. Is it covered?`); }
  q.push("Which team owns each story, and are any blocked by another team's roadmap?", "What is the launch market and date, and who signs off on the rollout thresholds?");
  return q;
}

/* ---------- exports ---------- */
const story = (s) => `As a ${s.asA}, I want ${s.iWant}, so that ${s.soThat}.`;
const acText = (a) => `Given ${a.given}, when ${a.when}, then ${a.then}.`;

export function packMarkdown(pack, brief, o) {
  const L = [`# ${brief.title}`, ``, `_${o.id} · delivery pack · ${pack.generator} · ${new Date(pack.generatedAt).toLocaleDateString()}_`, ``, `## Scope`, brief.scope, ``, `## Non-goals`, ...brief.nonGoals.split("\n").filter(Boolean).map((l) => `- ${l}`), ``, `## User stories`];
  for (const s of pack.stories) {
    L.push(``, `### ${s.id} · ${s.title} (${s.priority}, ${s.size})`, story(s), ``, `**Acceptance criteria**`, ...s.ac.map((a) => `- [ ] **${a.id}** ${acText(a)}${a.src ? ` _(${a.src})_` : ""}`));
    if (s.quote) L.push(``, `> “${s.quote.text}” (${s.quote.id})`);
    const tr = [...s.trace.signals, ...s.trace.gates, s.trace.proto && `prototype ${s.trace.proto}`].filter(Boolean);
    if (tr.length) L.push(``, `_Traces to: ${tr.join(", ")}_`);
  }
  L.push(``, `## Test scenarios`, ``, `| ID | Story | Type | Priority | Scenario | Automate |`, `|---|---|---|---|---|---|`,
    ...pack.scenarios.filter((t) => t.include).map((t) => `| ${t.id} | ${t.storyId} | ${t.type}${t.gate ? ` (${t.gate})` : ""} | ${t.priority} | ${t.title}: given ${t.given}, when ${t.when}, then ${t.then} | ${t.automate ? "yes" : "manual"} |`));
  L.push(``, `## Non-functional requirements`, ...pack.nfrs.map((x) => `- ${x}`), ``, `## Definition of Ready`, ...pack.dor.map((x) => `- [ ] ${x}`), ``, `## Definition of Done`, ...pack.dod.map((x) => `- [ ] ${x}`), ``, `## Open questions for engineering`, ...pack.questions.map((x) => `- ${x}`));
  L.push(``, `## Governance`, ...brief.gates.map((g) => `- ${g.name}: ${g.status}`), ``, `## Linked signals`, ...brief.signals.map((s) => `- ${s.id}: ${s.theme} (${s.volume.toLocaleString()} ${s.unit})`));
  return L.join("\n") + "\n";
}

export function packFeature(pack, brief) {
  const L = [`# ${brief.title}`, `# Generated by the PM Workbench delivery agent. One Feature per user story.`, ``];
  for (const s of pack.stories) {
    L.push(`@${s.id} @${s.priority.toLowerCase()}`, `Feature: ${s.title}`, `  ${story(s)}`, ``);
    for (const t of pack.scenarios.filter((x) => x.include && x.storyId === s.id)) {
      L.push(`  @${t.id} @${t.type}${t.gate ? ` @${t.gate.toLowerCase()}` : ""}${t.automate ? "" : " @manual"}`, `  Scenario: ${t.title}`, `    Given ${t.given}`, `    When ${t.when}`, `    Then ${t.then}`, ``);
    }
  }
  return L.join("\n");
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

// Azure DevOps "Import work items" CSV: tree via Title 1 / Title 2 / Title 3 columns.
export function packCsvAdo(pack, brief, o) {
  const rows = [["Work Item Type", "Title 1", "Title 2", "Title 3", "Description", "Acceptance Criteria", "Priority", "Story Points", "Tags"]];
  rows.push(["Epic", brief.title, "", "", brief.scope, "", "1", "", `PM-Workbench;${o.id}`]);
  const pts = { S: 2, M: 5, L: 8 };
  for (const s of pack.stories) {
    rows.push(["User Story", "", s.title, "", story(s), s.ac.map((a) => `${a.id}: ${acText(a)}`).join("\n"), s.priority === "Must" ? "1" : s.priority === "Should" ? "2" : "3", pts[s.size], [o.id, s.id, ...s.trace.gates].join(";")]);
    for (const t of pack.scenarios.filter((x) => x.include && x.storyId === s.id))
      rows.push(["Test Case", "", "", `${t.id} ${t.title}`, `Given ${t.given}\nWhen ${t.when}\nThen ${t.then}`, "", t.priority === "P1" ? "1" : "2", "", [t.type, t.gate, t.automate ? "automate" : "manual"].filter(Boolean).join(";")]);
  }
  return csv(rows);
}

// Jira Cloud CSV import: Issue Id + Parent Id build the hierarchy (Epic → Story → Sub-task test).
export function packCsvJira(pack, brief, o) {
  const rows = [["Issue Id", "Parent Id", "Issue Type", "Summary", "Description", "Priority", "Labels"]];
  rows.push(["1", "", "Epic", brief.title, brief.scope, "High", `pm-workbench ${o.id}`]);
  let id = 1;
  for (const s of pack.stories) {
    const sid = String(++id);
    rows.push([sid, "1", "Story", s.title, `${story(s)}\n\nh3. Acceptance criteria\n${s.ac.map((a) => `* *${a.id}* ${acText(a)}`).join("\n")}`, s.priority === "Must" ? "High" : "Medium", `${o.id} ${s.id}`]);
    for (const t of pack.scenarios.filter((x) => x.include && x.storyId === s.id))
      rows.push([String(++id), sid, "Sub-task", `Test ${t.id}: ${t.title}`, `*Given* ${t.given}\n*When* ${t.when}\n*Then* ${t.then}`, t.priority === "P1" ? "High" : "Medium", `test ${t.type}${t.automate ? " automate" : " manual"}`]);
  }
  return csv(rows);
}
