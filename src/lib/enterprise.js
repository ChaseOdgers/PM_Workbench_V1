// Connectors for the mock enterprise systems (mock-api/). The data lives outside the front end:
// the Workbench fetches it over HTTP from the hosted snapshot on GitHub, or from
// `npm run mock-api` on localhost. Each connector knows its system's response shape and maps it
// into the Workbench's record types, exactly the job a real Salesforce or Medallia connector does.
export const HOSTED_BASE = "https://raw.githubusercontent.com/ChaseOdgers/PM_Workbench_V1/main/mock-api/static";
export const LOCAL_BASE = "http://localhost:4010";

const day = (d) => (d.length === 10 ? `${d}T12:00:00Z` : d);

export const SYSTEMS = {
  "salesforce/cases": { label: "Salesforce Service Cloud", table: "support", unit: "cases", rows: (j) => j.records,
    map: (r) => ({ id: `CS-${r.CaseNumber}`, created: r.CreatedDate, text: r.Description, channel: r.Origin, category: r.Reason, customerTier: r.Account?.AAdvantage_Tier__c || "" }) },
  "chatbot/conversations": { label: "Booking assistant logs", table: "support", unit: "chats", rows: (j) => j.conversations,
    map: (r) => ({ id: r.conversationId, created: r.startedAt, text: r.firstCustomerMessage, channel: `Chatbot · ${r.channel}`, category: r.outcome.replace(/_/g, " "), customerTier: "" }) },
  "medallia/responses": { label: "Medallia", table: "feedback", unit: "responses", rows: (j) => j.data,
    map: (r) => ({ id: r.responseId, created: day(r.surveyDate), text: r.comment, source: `Medallia · ${r.touchpoint}`, rating: r.ltrScore, praise: r.ltrScore >= 9 }) },
  "appstore/reviews": { label: "App Store & Google Play", table: "feedback", unit: "reviews", rows: (j) => j.reviews,
    map: (r) => ({ id: r.id, created: r.updated, text: r.content, source: `${r.store} · v${r.version}`, rating: r.rating, praise: r.rating >= 4 }) },
  "cargo/exceptions": { label: "Cargo shipment exceptions", table: "support", unit: "shipments", rows: (j) => j.items,
    map: (r) => ({ id: r.awb, created: r.createdAt, text: r.note, channel: `${r.station} · ${r.exceptionCode}`, category: "Cargo exception", customerTier: r.customer }) },
  "ops/disruptions": { label: "Ops event bus", table: "support", unit: "events", rows: (j) => j.events,
    map: (r) => ({ id: r.eventId, created: r.scheduledDeparture, text: `${r.summary}. ${r.paxAffected} passengers on ${r.flight}.`, channel: `${r.station} · ${r.flight}`, category: r.type === "CANCEL" ? "Cancellation" : `Delay ${r.delayMinutes} min`, customerTier: "" }) },
  "adobe/metrics": { label: "Adobe Analytics", metrics: true, rows: (j) => j.series },
  "snowflake/kpis": { label: "Snowflake warehouse", metrics: true, rows: (j) => j.series },
};

export const endpointUrl = (base, endpoint) => `${(base || HOSTED_BASE).replace(/\/+$/, "")}/v1/${endpoint}.json`;

export async function fetchSystem(base, endpoint, apiKey) {
  const sys = SYSTEMS[endpoint];
  if (!sys) throw new Error(`no connector for ${endpoint}`);
  const url = endpointUrl(base, endpoint);
  let res;
  try { res = await fetch(url, apiKey ? { headers: { "x-api-key": apiKey } } : undefined); }
  catch { throw new Error(`can't reach ${url}. If you're using the local server, start it with npm run mock-api`); }
  if (res.status === 401) throw new Error("the API refused the key (401). Check the API key in Context & agents");
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  const rows = sys.rows(await res.json()) || [];
  return { url, rows: sys.metrics ? rows : rows.map(sys.map) };
}
