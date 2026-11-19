// Generates the mock enterprise systems the Workbench connects to. The data lives outside the
// front end: it is served over HTTP, either from GitHub (the committed static snapshot) or from
// mock-api/server.mjs running locally. Each system returns its own vendor-style shape, and the
// Workbench's connectors map those shapes into records, the same way a client build would.
// Deterministic (seeded): re-running gives the same files.
// Usage: node mock-api/generate.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "static", "v1");
let seed = 2026;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rand() * a.length)];
const END = Date.parse("2026-11-18T22:00:00Z");
const DAY = 86400000, WEEK = 7 * DAY;
// growth > 1 skews records toward recent weeks (a rising theme); 1 = flat over 12 weeks.
const when = (growth = 1) => new Date(END - Math.floor(Math.pow(rand(), growth) * 84 * DAY) - Math.floor(rand() * DAY)).toISOString();
const HUBS = ["DFW", "CLT", "ORD", "MIA", "PHX", "PHL", "DCA", "LAX", "JFK", "LGA"];
const fill = (s) => s.replace(/\{hub\}/g, () => pick(HUBS)).replace(/\{hub2\}/g, () => pick(HUBS)).replace(/\{fl\}/g, () => String(100 + Math.floor(rand() * 2800))).replace(/\{n\}/g, () => String(2 + Math.floor(rand() * 5)));

// What customers say, per theme. Five themes are new in this data and back the new opportunities:
// pets, upgradelist, assist, boardingpass, cargotrack.
const SAY = {
  soldout: ["Fare sold out while I was paying for {hub}-{hub2} and the site offered nothing else.", "The flight I picked sold out, had to call to find another flight the same day.", "Last seat disappeared at checkout. Is there a later flight?", "Sold out message with no alternatives, ended up booking another airline."],
  irops: ["Flight {fl} cancelled at {hub}, two hours on hold to rebook.", "Missed my connection in {hub} after a delay and the app would not rebook me.", "Rebooked onto a flight two days later, I need to travel today.", "Is my ticket covered by the weather waiver for {hub}?"],
  refund: ["Flight changed by 5 hours, I want a refund not a travel credit.", "Still waiting on my refund for the cancelled {hub} trip.", "Why did I get a voucher instead of cash?"],
  payment: ["Payment page timed out on my phone and I re-entered everything.", "Card declined in the app but works on the website.", "Saved card is missing at checkout again."],
  baggage: ["My checked bag never arrived in {hub}, no update for two days.", "Bag tracking says loaded but my suitcase is not here.", "Damaged suitcase, how long does the claim take?"],
  loyalty: ["How do I use miles to upgrade a booking I already have?", "The miles upgrade option is greyed out.", "AAdvantage miles from my last trip never posted."],
  pets: ["Trying to book my dog in the cabin, the website says to call. Why can't I add a pet online?", "Called twice to add my cat to my reservation, 40 minute hold each time.", "Is there room for a pet carrier on flight {fl}? The app will not tell me.", "Paid the pet fee at the airport because I could not add my dog during booking.", "Pet carrier rules are confusing, what size fits under the seat on the regional jet?", "Booked online then found out the in-cabin pet limit was already reached on my flight."],
  upgradelist: ["The upgrade list showed me number 2 and then someone else cleared, nobody explained why.", "Why can't I see my position on the upgrade list until the gate?", "Upgrade list said I cleared, then the seat was gone when I boarded.", "I get no notification when my upgrade clears, found out at the gate.", "Upgrade list position keeps jumping around in the app.", "Missed my upgrade because I did not know the standby upgrade list had moved."],
  assist: ["Requested a wheelchair at booking, nobody was at the gate in {hub} when I landed.", "Waited 50 minutes for wheelchair assistance and missed my connection.", "My mother needs mobility assistance, the request did not carry over after the rebooking.", "Wheelchair request disappeared after the schedule change.", "No assistance at the {hub} gate even though it was on the reservation.", "Special assistance agent never showed for the connection in {hub}."],
  boardingpass: ["Mobile boarding pass would not load at the gate, had to go back to the counter.", "Boarding pass QR code is blank in the app.", "Boarding pass will not save to my wallet anymore.", "App logged me out right at boarding and my boarding pass was gone.", "Boarding pass shows the old gate after the gate change.", "Had no signal at {hub} security and the boarding pass would not open offline."],
  cargotrack: ["Shipment AWB 001-{fl}{fl} shows no status since departure from {hub}.", "Our freight missed the connection in {hub} and nobody told us until the consignee called.", "Need proactive status for pallets moving {hub} to {hub2}, we track by calling the station.", "Cargo tracking page says received, the customer says it is not there.", "Perishable shipment sat at {hub} for a day with no alert.", "Air waybill status has not updated in 30 hours."],
};
// Volume per system per theme, and how fast it is growing.
const PLAN = {
  salesforce: { soldout: [70, 1.6], irops: [95, 1.4], refund: [30, 1.8], payment: [40, 1.2], baggage: [55, 1.3], loyalty: [20, 1.1], pets: [64, 1.9], upgradelist: [48, 1.7], assist: [52, 1.8], boardingpass: [44, 2.0] },
  chatbot: { irops: [60, 1.4], soldout: [35, 1.5], pets: [42, 1.7], boardingpass: [30, 1.8], upgradelist: [26, 1.5], refund: [20, 1.6] },
  medallia: { soldout: [30, 1.4], irops: [40, 1.4], baggage: [25, 1.2], upgradelist: [34, 1.6], assist: [28, 1.9], boardingpass: [22, 1.8], pets: [18, 1.6] },
  appstore: { boardingpass: [56, 2.2], payment: [28, 1.2], soldout: [18, 1.4], upgradelist: [24, 1.5], pets: [12, 1.5] },
};
const TIERS = ["General", "Gold", "Platinum", "Platinum Pro", "Executive Platinum", "General", "General"];

function write(path, data) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
  return file;
}
const out = [];

/* Salesforce Service Cloud · cases (SOQL query result shape) */
let cn = 4810000;
const cases = [];
for (const [theme, [n, g]] of Object.entries(PLAN.salesforce)) for (let i = 0; i < n; i++) {
  const text = fill(pick(SAY[theme]));
  cases.push({ attributes: { type: "Case", url: `/services/data/v59.0/sobjects/Case/500Hs00001${String(cn).slice(-6)}` }, Id: `500Hs00001${String(cn).slice(-6)}AAA`, CaseNumber: String(cn++),
    CreatedDate: when(g), Origin: pick(["Phone", "Email", "Web", "Chat", "Social"]), Subject: text.split(/[.,?]/)[0].slice(0, 70), Description: text,
    Reason: { soldout: "Booking", irops: "Irregular Operations", refund: "Refunds", payment: "Payment", baggage: "Baggage", loyalty: "AAdvantage", pets: "Special Services", upgradelist: "AAdvantage", assist: "Special Services", boardingpass: "Digital", cargotrack: "Cargo" }[theme],
    Priority: pick(["Low", "Medium", "Medium", "High"]), Status: pick(["New", "Working", "Closed", "Closed"]), Account: { Name: "Individual", AAdvantage_Tier__c: pick(TIERS) } });
}
cases.sort((a, b) => b.CreatedDate.localeCompare(a.CreatedDate));
out.push(write("salesforce/cases.json", { totalSize: cases.length, done: true, records: cases }));

/* Booking assistant (chatbot) · conversations */
let cv = 920000;
const convs = [];
for (const [theme, [n, g]] of Object.entries(PLAN.chatbot)) for (let i = 0; i < n; i++) {
  const handed = rand() < 0.45;
  convs.push({ conversationId: `CONV-${cv++}`, startedAt: when(g), channel: pick(["web", "ios", "android"]), firstCustomerMessage: fill(pick(SAY[theme])), turns: 2 + Math.floor(rand() * 10), outcome: handed ? "handed_to_agent" : pick(["resolved", "abandoned"]) });
}
convs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
out.push(write("chatbot/conversations.json", { conversations: convs, nextPageToken: null }));

/* Medallia · survey responses */
let rs = 7700000;
const resp = [];
for (const [theme, [n, g]] of Object.entries(PLAN.medallia)) for (let i = 0; i < n; i++)
  resp.push({ responseId: `r_${rs++}`, surveyDate: when(g).slice(0, 10), ltrScore: Math.floor(rand() * 7), touchpoint: pick(["Booking", "Airport", "Inflight", "Post-trip"]), comment: fill(pick(SAY[theme])), segment: pick(TIERS) });
const praise = ["Crew was great and we landed early.", "Smooth trip, easy check-in.", "Gate agent in {hub} was very helpful.", "Clean cabin and on time.", "Comfortable flight, thanks.", "Easy rebooking, fast."];
for (let i = 0; i < 90; i++) resp.push({ responseId: `r_${rs++}`, surveyDate: when(1).slice(0, 10), ltrScore: 9 + Math.floor(rand() * 2), touchpoint: pick(["Booking", "Airport", "Inflight"]), comment: fill(pick(praise)), segment: pick(TIERS) });
resp.sort((a, b) => b.surveyDate.localeCompare(a.surveyDate));
out.push(write("medallia/responses.json", { data: resp, paging: { total: resp.length } }));

/* App Store + Google Play · reviews */
let rv = 3300000;
const reviews = [];
for (const [theme, [n, g]] of Object.entries(PLAN.appstore)) for (let i = 0; i < n; i++) {
  const t = fill(pick(SAY[theme]));
  reviews.push({ id: `rev-${rv++}`, updated: when(g), store: pick(["App Store", "Google Play"]), rating: 1 + Math.floor(rand() * 2), title: t.split(/[.,?]/)[0].slice(0, 48), content: t, version: pick(["2026.10.2", "2026.11.0", "2026.11.1"]) });
}
reviews.sort((a, b) => b.updated.localeCompare(a.updated));
out.push(write("appstore/reviews.json", { reviews }));

/* Cargo · shipment exceptions */
let awb = 1;
const exc = [];
for (let i = 0; i < 88; i++) exc.push({ awb: `001-${String(48200000 + awb++)}`, createdAt: when(1.7), station: pick(HUBS), exceptionCode: pick(["MSCA", "OFLD", "NFD", "DLV-LATE", "STATUS-GAP"]), customer: pick(["Northwind Freight", "Contoso Pharma", "Fabrikam Foods", "Tailspin Parts", "Litware Logistics"]), note: fill(pick(SAY.cargotrack)) });
exc.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
out.push(write("cargo/exceptions.json", { items: exc, count: exc.length }));

/* Ops event bus · disruptions */
const events = [];
let ev = 1;
for (let i = 0; i < 160; i++) {
  const type = rand() < 0.3 ? "CANCEL" : "DELAY";
  const cause = pick(["WEATHER", "WEATHER", "ATC", "MAINTENANCE", "CREW"]);
  const st = pick(HUBS);
  events.push({ eventId: `OPS-${String(60000 + ev++)}`, scheduledDeparture: when(1.3), flight: `AA${100 + Math.floor(rand() * 2800)}`, station: st, type, cause, delayMinutes: type === "DELAY" ? 45 + Math.floor(rand() * 240) : null, paxAffected: 60 + Math.floor(rand() * 160),
    summary: `${type === "CANCEL" ? "Cancellation" : "Delay"} at ${st} (${cause.toLowerCase()}): rebooking required for connecting passengers` });
}
events.sort((a, b) => b.scheduledDeparture.localeCompare(a.scheduledDeparture));
out.push(write("ops/disruptions.json", { events }));

/* Adobe Analytics + Snowflake · weekly metrics (what the logs and the warehouse count) */
const weeks = (base, growth, noise = 0.08) => Array.from({ length: 12 }, (_, i) => {
  const t = i / 11;
  return { weekStart: new Date(END - (11 - i) * WEEK - 3 * DAY).toISOString().slice(0, 10), value: Math.round(base * (1 + growth * t) * (1 + (rand() - 0.5) * noise)) };
});
out.push(write("adobe/metrics.json", { reportSuite: "aa-digital-prod", series: [
  { metric: "soldout_abandon_sessions", themeKey: "soldout", label: "Sessions abandoned after a sold-out result", unit: "sessions", weeks: weeks(290, 0.55) },
  { metric: "payment_step_exits", themeKey: "payment", label: "Exits on the payment step (mobile)", unit: "sessions", weeks: weeks(120, 0.3) },
  { metric: "pet_page_exits_to_call", themeKey: "pets", label: "Pet policy page visits that end in a call", unit: "sessions", weeks: weeks(210, 0.7) },
  { metric: "boarding_pass_render_errors", themeKey: "boardingpass", label: "Mobile boarding pass load errors", unit: "errors", weeks: weeks(380, 0.9) },
  { metric: "upgrade_list_views", themeKey: "upgradelist", label: "Upgrade-list screen views per departure day", unit: "views", weeks: weeks(5200, 0.25) },
] }));
out.push(write("snowflake/kpis.json", { warehouse: "BOOKING_ANALYTICS", series: [
  { metric: "bookings_lost_soldout", themeKey: "soldout", label: "Bookings lost after a sell-out", unit: "bookings", weeks: weeks(140, 0.5) },
  { metric: "bag_claims_filed", themeKey: "baggage", label: "Mishandled-bag claims filed", unit: "claims", weeks: weeks(150, 0.2) },
  { metric: "pet_fee_collected_airport", themeKey: "pets", label: "Pet fees collected at the airport, not online", unit: "bookings", weeks: weeks(160, 0.5) },
  { metric: "assist_requests_missed", themeKey: "assist", label: "Wheelchair requests not met within 15 minutes", unit: "requests", weeks: weeks(74, 0.8) },
  { metric: "cargo_status_gaps", themeKey: "cargotrack", label: "Shipments with no status for 12h+", unit: "shipments", weeks: weeks(52, 0.6) },
] }));

/* Catalog */
out.push(write("index.json", { name: "Mock enterprise systems for the Agentic PM Workbench", generated: new Date(END).toISOString(), note: "Synthetic data. Shapes follow each vendor's public API loosely.",
  endpoints: { "salesforce/cases": cases.length, "chatbot/conversations": convs.length, "medallia/responses": resp.length, "appstore/reviews": reviews.length, "cargo/exceptions": exc.length, "ops/disruptions": events.length, "adobe/metrics": 5, "snowflake/kpis": 5 } }));
console.log(`Wrote ${out.length} files under ${root}`);
