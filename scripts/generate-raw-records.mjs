// Generates the "raw client data" layer of a mock pack: the records agents read.
// Deterministic (seeded), so re-running gives the same files.
// Usage: node scripts/generate-raw-records.mjs [packId]   (default: aa)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pack = process.argv[2] || "aa";
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "packs", pack);

let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rand() * a.length)];

const THEMES = {
  soldout: { stream: "res", category: "Booking", texts: [
    "My fare sold out halfway through booking and the site just said unavailable. What else is there?",
    "Tried to book DFW-LGA, last seat vanished at payment. Had to call to find another flight.",
    "Is there a later flight the same day? The one I picked is sold out now.",
    "Search showed a fare, then it was gone. No alternatives offered, so I booked elsewhere.",
    "Can you check nearby dates? Friday is sold out in Main Cabin.",
    "Why doesn't the app suggest another flight when mine sells out?" ] },
  refund: { stream: "res", category: "Refunds", texts: [
    "My flight moved by 4 hours. Am I owed a refund under the new rule?",
    "Requested a refund for a cancelled flight two weeks ago, still waiting.",
    "Got a travel credit instead of cash after a cancellation. Isn't cash required now?" ] },
  payment: { stream: "res", category: "Checkout", texts: [
    "Payment page timed out on my phone and I had to type everything in again.",
    "Why do I have to re-enter my passport info every single booking?",
    "Card declined on the app but worked on desktop.",
    "Saved card isn't showing at checkout." ] },
  ancillary: { stream: "res", category: "Seats & bags", texts: [
    "I didn't see the seat options until after I paid.",
    "Would have bought priority boarding if it was offered with the ticket.",
    "Bag fee was cheaper online but I only found that out at the airport." ] },
  itinerary: { stream: "res", category: "Trip management", texts: [
    "Got three emails about a schedule change and none say the new time clearly.",
    "Where do I see my full itinerary with the connection?",
    "App and email show different departure times." ] },
  fareclass: { stream: "res", category: "Fares", texts: [
    "What's the difference between Basic and Main Select?",
    "Fare names are confusing, I bought the wrong one." ] },
  giftcard: { stream: "res", category: "Checkout", texts: [ "Gift card code rejected at checkout.", "Gift card balance not applied to my booking." ] },
  irops: { stream: "care", category: "IROPS", texts: [
    "Flight cancelled for weather, two hours on hold to rebook.",
    "App says delayed but won't let me change flights myself.",
    "Rebooked me on a flight tomorrow, I need today. Line at the counter is huge.",
    "Missed my connection, nobody told me what to do.",
    "Chatbot couldn't tell me if the waiver covers my ticket." ] },
  baggage: { stream: "bag", category: "Baggage", texts: [
    "My bag didn't arrive in ORD, no update for 2 days.",
    "Tracker says loaded, but it never came out at the belt.",
    "Filed a claim for a damaged suitcase, how long does it take?" ] },
  loyalty: { stream: "loyalty", category: "AAdvantage", texts: [
    "How do I use miles to upgrade an existing booking?",
    "Upgrade with miles option is greyed out." ] },
};

const channels = ["Phone", "Email", "Chat", "Social"];
const tiers = ["General", "Gold", "Platinum", "Executive Platinum", "General", "General"];
const base = Date.parse("2026-11-11T12:00:00Z");
const weights = { soldout: 46, refund: 10, payment: 30, ancillary: 14, itinerary: 18, fareclass: 6, giftcard: 4, irops: 44, baggage: 26, loyalty: 10 };

const contacts = [];
let n = 1;
for (const [key, count] of Object.entries(weights)) {
  const t = THEMES[key];
  for (let i = 0; i < count; i++) {
    // later weeks get more records for growing themes, which gives each trend a real shape
    const daysAgo = Math.floor(Math.pow(rand(), 1.6) * 56);
    contacts.push({
      id: `SC-${String(70000 + n++)}`,
      created: new Date(base - daysAgo * 86400000 - Math.floor(rand() * 86400000)).toISOString(),
      channel: pick(channels), category: t.category, customerTier: pick(tiers),
      text: pick(t.texts), themeKey: key, streamId: t.stream, sourceId: "src-sfdc",
    });
  }
}
contacts.sort((a, b) => b.created.localeCompare(a.created));

const feedback = [];
const fbTexts = {
  soldout: ["Love the airline but booking when flights sell out is painful.", "Couldn't find another option when my flight sold out."],
  payment: ["Checkout on the app is slow and asks for everything again.", "Make saved payment actually work."],
  fareclass: ["Fare names make no sense.", "Too many fare types."],
  irops: ["Rebooking during the storm was a nightmare.", "Let me rebook myself in the app!"],
  baggage: ["No idea where my bag was for two days.", "Bag tracking needs to be real-time."],
};
let f = 1;
for (const [key, texts] of Object.entries(fbTexts)) {
  for (let i = 0; i < 12; i++) {
    const daysAgo = Math.floor(rand() * 56);
    feedback.push({
      id: `FB-${String(3000 + f++)}`, created: new Date(base - daysAgo * 86400000).toISOString(),
      source: pick(["NPS survey", "App Store", "Google Play"]), rating: 1 + Math.floor(rand() * 3),
      text: pick(texts), themeKey: key, sourceId: key === "fareclass" ? "src-appstore" : "src-vox",
    });
  }
}

const webItems = [
  { id: "WEB-1", created: "2026-11-09T14:00:00Z", source: "regulations.gov", title: "DOT final rule: automatic refunds for cancelled or significantly changed flights", themeKey: "refund", sourceId: "src-dot" },
  { id: "WEB-2", created: "2026-11-05T09:00:00Z", source: "Competitor newsroom", title: "Competitor adds 72-hour fare lock for a small fee", themeKey: "market", sourceId: "src-crawl" },
  { id: "WEB-3", created: "2026-10-28T09:00:00Z", source: "Competitor newsroom", title: "Competitor launches real-time bag tracking map in its app", themeKey: "market", sourceId: "src-crawl" },
  { id: "WEB-4", created: "2026-10-20T09:00:00Z", source: "Industry press", title: "Airlines lose an estimated 1 in 4 sold-out searches to rivals", themeKey: "soldout", sourceId: "src-crawl" },
];

writeFileSync(join(out, "supportContacts.json"), JSON.stringify(contacts, null, 1));
writeFileSync(join(out, "feedback.json"), JSON.stringify(feedback, null, 1));
writeFileSync(join(out, "webItems.json"), JSON.stringify(webItems, null, 1));
console.log(`Wrote ${contacts.length} support contacts, ${feedback.length} feedback items, ${webItems.length} web items to ${out}`);
