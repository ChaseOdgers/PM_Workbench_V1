// What customers say, per theme: used by the live server to inject new records mid-demo
// (surge and drip). The first block mirrors generate.mjs; the last themes are NOT in the
// Workbench's theme library, so a surge of them shows the signals agent discovering something new.
export const HUBS = ["DFW", "CLT", "ORD", "MIA", "PHX", "PHL", "DCA", "LAX", "JFK", "LGA"];
export const TIERS = ["General", "Gold", "Platinum", "Platinum Pro", "Executive Platinum", "General", "General"];

export const SAY = {
  soldout: ["Fare sold out while I was paying for {hub}-{hub2} and the site offered nothing else.", "The flight I picked sold out, had to call to find another flight the same day.", "Last seat disappeared at checkout. Is there a later flight?"],
  irops: ["Flight {fl} cancelled at {hub}, two hours on hold to rebook.", "Missed my connection in {hub} after a delay and the app would not rebook me.", "Rebooked onto a flight two days later, I need to travel today."],
  refund: ["Flight changed by 5 hours, I want a refund not a travel credit.", "Still waiting on my refund for the cancelled {hub} trip."],
  payment: ["Payment page timed out on my phone and I re-entered everything.", "Card declined in the app but works on the website."],
  baggage: ["My checked bag never arrived in {hub}, no update for two days.", "Bag tracking says loaded but my suitcase is not here."],
  pets: ["Trying to book my dog in the cabin, the website says to call. Why can't I add a pet online?", "Called twice to add my cat to my reservation, 40 minute hold each time.", "Is there room for a pet carrier on flight {fl}? The app will not tell me.", "Paid the pet fee at the airport because I could not add my dog during booking."],
  upgradelist: ["The upgrade list showed me number 2 and then someone else cleared, nobody explained why.", "Why can't I see my position on the upgrade list until the gate?"],
  assist: ["Requested a wheelchair at booking, nobody was at the gate in {hub} when I landed.", "Waited 50 minutes for wheelchair assistance and missed my connection."],
  boardingpass: ["Mobile boarding pass would not load at the gate, had to go back to the counter.", "Boarding pass QR code is blank in the app."],
  // Not in the theme library: the agent has to discover these.
  wifi: ["Paid for wifi on flight {fl} and it never connected, I want my money back.", "Inflight wifi dropped every five minutes from {hub} to {hub2}, could not work at all.", "Wifi portal charged me and then showed an error page.", "Streaming was advertised but the wifi was down for the entire trip from {hub}."],
  lounge: ["The lounge at {hub} was so crowded there were no seats anywhere.", "Admirals Club lounge in {hub} had a line out the door at 7am.", "Lounge at {hub} was overcrowded and out of food by noon."],
};

export function filler(rand = Math.random) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  return {
    pick,
    fill: (s) => s.replace(/\{hub\}/g, () => pick(HUBS)).replace(/\{hub2\}/g, () => pick(HUBS)).replace(/\{fl\}/g, () => String(100 + Math.floor(rand() * 2800))),
  };
}

const REASON = { soldout: "Booking", irops: "Irregular Operations", refund: "Refunds", payment: "Payment", baggage: "Baggage", pets: "Special Services", upgradelist: "AAdvantage", assist: "Special Services", boardingpass: "Digital", wifi: "Inflight", lounge: "Airport" };

// One new record in each system's own shape. `at` is an ISO timestamp; `n` makes the id unique.
export const BUILD = {
  "salesforce/cases": { list: (j) => j.records, after: (j) => { j.totalSize = j.records.length; },
    make: (theme, text, at, n, pick) => ({ attributes: { type: "Case" }, Id: `500Hs00009${String(n).padStart(6, "0")}AAA`, CaseNumber: String(4900000 + n), CreatedDate: at, Origin: pick(["Phone", "Email", "Web", "Chat", "Social"]),
      Subject: text.split(/[.,?]/)[0].slice(0, 70), Description: text, Reason: REASON[theme] || "General", Priority: pick(["Medium", "High"]), Status: "New", Account: { Name: "Individual", AAdvantage_Tier__c: pick(TIERS) } }) },
  "chatbot/conversations": { list: (j) => j.conversations,
    make: (theme, text, at, n, pick) => ({ conversationId: `CONV-9${String(n).padStart(5, "0")}`, startedAt: at, channel: pick(["web", "ios", "android"]), firstCustomerMessage: text, turns: 3, outcome: pick(["handed_to_agent", "abandoned"]) }) },
  "medallia/responses": { list: (j) => j.data, after: (j) => { j.paging = { total: j.data.length }; },
    make: (theme, text, at, n, pick) => ({ responseId: `r_9${String(n).padStart(6, "0")}`, surveyDate: at.slice(0, 10), ltrScore: pick([0, 1, 2, 3, 4]), touchpoint: pick(["Booking", "Airport", "Inflight"]), comment: text, segment: pick(TIERS) }) },
  "appstore/reviews": { list: (j) => j.reviews,
    make: (theme, text, at, n, pick) => ({ id: `rev-9${String(n).padStart(6, "0")}`, updated: at, store: pick(["App Store", "Google Play"]), rating: pick([1, 2]), title: text.split(/[.,?]/)[0].slice(0, 48), content: text, version: "2026.11.1" }) },
};
