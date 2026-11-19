// Writes the sample upload files used by Context & agents → Add source → File upload.
// They look like real exports (a Zendesk ticket CSV and an app-review JSON) and include themes
// the pack doesn't know yet (Wi-Fi, boarding passes, legroom, app crashes), so the import
// shows emerging-theme discovery as well as corroboration.
// Usage: node scripts/generate-samples.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "samples");
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rand() * a.length)];
const END = Date.parse("2026-11-17T18:00:00Z");
const DAY = 86400000;
// growth: 1 = flat, >1 = more recent records
const when = (growth) => new Date(END - Math.floor(Math.pow(rand(), growth) * 56) * DAY - Math.floor(rand() * DAY)).toISOString();

const TICKETS = {
  soldout: { n: 38, g: 1.7, tag: "booking", subj: ["Fare disappeared", "Flight sold out mid-booking", "No other options shown"], body: [
    "Picked a fare to Miami and it was sold out by the time I got to payment. The site didn't show any other flight.",
    "The 6pm to Chicago sold out while I was entering passenger details. Is there a later flight I can get at a similar price?",
    "Last seat in Main Cabin vanished. I had to call to hear about the flight an hour later.",
    "Your app said unavailable and gave me nothing else. I booked a different airline." ] },
  irops: { n: 44, g: 1.4, tag: "irops", subj: ["Cancelled flight", "Rebooking help", "Missed connection at DFW"], body: [
    "My flight was cancelled due to weather and I was on hold for 90 minutes trying to rebook.",
    "Delay made me miss my connection in Charlotte and the app wouldn't let me rebook myself.",
    "Got rebooked onto a flight two days later. I need to get home tomorrow. What are my options?",
    "Is my ticket covered by the travel waiver for the storm? The chatbot couldn't say." ] },
  refund: { n: 22, g: 1.9, tag: "refunds", subj: ["Refund status", "Refund instead of credit", "Schedule change refund"], body: [
    "My flight was moved by five hours. I want a refund, not a travel credit.",
    "I requested a refund three weeks ago for a cancelled trip and still haven't seen it.",
    "Why was I given a voucher? I thought cash refunds were required now." ] },
  payment: { n: 26, g: 1.2, tag: "checkout", subj: ["Payment failed", "Checkout keeps timing out", "Saved card missing"], body: [
    "Checkout timed out twice on my phone and I had to type all my details again.",
    "My card was declined in the app but works everywhere else.",
    "Saved card doesn't appear at payment, so I re-enter it every booking." ] },
  baggage: { n: 30, g: 1.3, tag: "baggage", subj: ["Bag not delivered", "Damaged suitcase", "Where is my luggage"], body: [
    "My checked bag never came out at the belt in Phoenix. No update in two days.",
    "Suitcase arrived with a broken handle. How do I file the claim?",
    "Bag tracking in the app says loaded, but my luggage isn't here." ] },
  wifi: { n: 24, g: 2.2, tag: "onboard", subj: ["Wifi didn't work", "Paid for wifi", "Wifi not working"], body: [
    "Paid for wifi on my flight to Boston and it never connected the whole way.",
    "The wifi kept dropping every few minutes. I couldn't work at all.",
    "Wifi portal took my money and then showed an error page.",
    "Streaming said it was included but the wifi was down for the entire trip." ] },
  boarding: { n: 20, g: 2.0, tag: "mobile", subj: ["Boarding pass won't load", "Mobile boarding pass", "Can't add pass to wallet"], body: [
    "My mobile boarding pass wouldn't load at the gate and I had to go back to the counter.",
    "The boarding pass shows a blank QR code in the app.",
    "Boarding pass isn't saving to Apple Wallet anymore." ] },
  legroom: { n: 16, g: 1.1, tag: "onboard", subj: ["Legroom", "Not enough legroom", "Legroom complaint"], body: [
    "Legroom on the new 737 seats is terrible. My knees were against the seat in front.",
    "Is there a way to see legroom before I pick a seat? The last flight was awful.",
    "Paid for a better seat expecting more legroom and it was the same." ] },
  misc: { n: 20, g: 1, tag: "general", subj: ["Question", "Feedback", "General inquiry"], body: [
    "How early should I arrive for an international departure from JFK?",
    "Can I bring my guitar as a carry-on?",
    "Please update my name on the reservation, it has a typo.",
    "Thanks to the crew on flight 1123, they were great.",
    "Do you sell gift memberships for the lounge?",
    "What documents does my teenager need to fly alone?",
    "Is there a charge to bring a car seat for my toddler?",
    "Looking for the receipt for my trip last March for expenses.",
    "Can I pick up a print copy of my invoice at the airport?",
    "Our group of twelve wants to sit together, who do I contact?",
    "Need to add a known traveler number to my booking.",
    "Which terminal does the Phoenix route use at LAX?" ] },
};

const rows = [];
let id = 48210;
for (const t of Object.values(TICKETS)) {
  for (let i = 0; i < t.n; i++) {
    rows.push({ id: id++, created: when(t.g), subject: pick(t.subj), description: pick(t.body), channel: pick(["email", "web", "chat", "phone", "twitter"]), priority: pick(["low", "normal", "normal", "high"]), tags: t.tag });
  }
}
rows.sort((a, b) => b.created.localeCompare(a.created));
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const csv = ["Ticket ID,Created at,Subject,Description,Via,Priority,Tags", ...rows.map((r) => [r.id, r.created, q(r.subject), q(r.description), r.channel, r.priority, r.tags].join(","))].join("\r\n");
writeFileSync(join(out, "support-tickets-sample.csv"), csv + "\r\n");

const REVIEWS = {
  crash: { n: 24, g: 2.1, r: [1, 2], t: ["App crashes constantly", "Crashes on launch", "Unusable"], b: [
    "The app crashes every time I open my trips. Reinstalled twice.",
    "Since the last update the app crashes when I try to check in.",
    "App crashes at the seat map screen, so I can't change seats." ] },
  boarding: { n: 18, g: 1.8, r: [1, 2, 3], t: ["Boarding pass issues", "Pass won't show"], b: [
    "Boarding pass disappears from the app right before boarding.",
    "Had to screenshot my boarding pass because the app wouldn't open it offline." ] },
  payment: { n: 16, g: 1.2, r: [1, 2], t: ["Checkout is painful", "Payment errors"], b: [
    "Payment failed three times on the app. Desktop worked fine.",
    "Why do I have to re-enter my passport and card on every booking?" ] },
  soldout: { n: 12, g: 1.5, r: [2, 3], t: ["No alternatives", "Sold out"], b: [
    "When a flight is sold out the app just stops. Show me other flights!",
    "Fare sold out while I was booking and no alternative was offered." ] },
  happy: { n: 20, g: 1, r: [4, 5], t: ["Great app", "Easy to use", "Love it"], b: [
    "Easy to use and the flight status alerts are very helpful.",
    "Smooth experience, check-in took seconds.",
    "Love the new trip view.",
    "Five stars, everything I need for my commute flights.",
    "Gate change notification reached me before the announcement.",
    "Clean design. Finding my reservation is quick.",
    "Upgraded my seat in two taps, nice job.",
    "Best airline app I have used so far." ] },
};
const reviews = [];
let rid = 90100;
for (const t of Object.values(REVIEWS)) {
  for (let i = 0; i < t.n; i++) reviews.push({ review_id: `R${rid++}`, date: when(t.g).slice(0, 10), platform: pick(["iOS", "Android"]), rating: pick(t.r), title: pick(t.t), body: pick(t.b), app_version: pick(["2026.10.2", "2026.11.0", "2026.11.1"]) });
}
reviews.sort((a, b) => b.date.localeCompare(a.date));
writeFileSync(join(out, "app-reviews-sample.json"), JSON.stringify({ app: "Example Airline", exported: "2026-11-18", reviews }, null, 1) + "\n");
// NPS survey export: score 0-10 plus a verbatim. Promoters' comments are varied praise.
const NPS = {
  soldout: { n: 34, g: 1.6, s: [0, 6], c: ["Fare sold out while booking and the site offered nothing else.", "When my flight sold out I had to call to find another option.", "Last seat disappeared at payment, no alternate flight suggested."] },
  irops: { n: 46, g: 1.5, s: [0, 5], c: ["Cancelled for weather and rebooking took hours on hold.", "Missed my connection after a delay and nobody helped me rebook.", "The app wouldn't let me rebook myself during the storm."] },
  baggage: { n: 28, g: 1.2, s: [0, 5], c: ["My checked bag took three days to show up.", "Bag tracking said delivered but my suitcase was lost.", "Damaged luggage and the claim process is slow."] },
  loyalty: { n: 22, g: 1.3, s: [3, 8], c: ["Hard to use miles for an upgrade on an existing booking.", "The AAdvantage upgrade list never moves.", "Using miles is confusing compared with other airlines."] },
  wifi: { n: 26, g: 2.0, s: [2, 7], c: ["Wifi didn't work for most of the flight.", "Paid for wifi and couldn't connect.", "Inflight wifi is too slow to do any work."] },
  lounge: { n: 24, g: 2.3, s: [2, 7], c: ["The lounge in DFW was so crowded there were no seats.", "Admirals Club lounge had a line out the door.", "Lounge was overcrowded and out of food by noon."] },
  boarding: { n: 20, g: 1.4, s: [3, 7], c: ["Boarding groups are chaotic, everyone crowds the gate.", "Too many boarding groups, group 9 never gets bin space.", "Boarding groups make no sense anymore."] },
  promoters: { n: 100, g: 1, s: [9, 10], c: ["Crew was wonderful and we landed early.", "Smooth from check-in to landing.", "Friendly gate agent fixed my seat in seconds.", "On time both ways, could not ask for more.", "Comfortable seat and a kind flight attendant.", "Quick security, quick boarding, quick flight.", "Pilot kept us informed the whole way.", "Snacks were good and the cabin was clean.", "Got to sit with my family without any hassle.", "Mobile check-in was effortless.", "Arrived early and bags came out fast.", "Best trip I have had in years.", "Staff in Miami went above and beyond.", "Upgrade cleared and the service was excellent.", "Really pleasant flight, thank you."] },
};
const nps = [];
let nid = 1;
for (const t of Object.values(NPS)) for (let i = 0; i < t.n; i++) {
  nps.push({ id: `NPS-${String(55000 + nid++)}`, at: when(t.g), score: t.s[0] + Math.floor(rand() * (t.s[1] - t.s[0] + 1)), comment: pick(t.c), segment: pick(["General", "Gold", "Platinum", "Executive Platinum", "General"]), route: pick(["DFW-LGA", "CLT-MIA", "ORD-LAX", "PHX-DFW", "PHL-BOS", "MIA-JFK"]) });
}
nps.sort((a, b) => b.at.localeCompare(a.at));
writeFileSync(join(out, "nps-survey-sample.csv"), ["Response ID,Submitted,Score,Comment,Segment,Route", ...nps.map((r) => [r.id, r.at.slice(0, 10), r.score, q(r.comment), r.segment, r.route].join(","))].join("\r\n") + "\r\n");

// Chatbot transcripts: the customer's opening message per conversation.
const CHAT = {
  irops: { n: 40, g: 1.5, i: "Rebook", m: ["My flight got cancelled, can you rebook me?", "Flight is delayed and I'll miss my connection. What are my options?", "Does the weather waiver cover my trip tomorrow?"] },
  refund: { n: 26, g: 1.8, i: "Refund", m: ["I want a refund for my cancelled flight.", "How do I get cash back instead of a travel credit?", "Where is my refund? It has been 3 weeks."] },
  baggage: { n: 24, g: 1.2, i: "Bags", m: ["Where is my bag? It didn't arrive.", "How do I report damaged luggage?", "My suitcase is still missing."] },
  soldout: { n: 22, g: 1.6, i: "Booking", m: ["The flight I wanted is sold out, is there another flight today?", "Fare disappeared while I was booking, can you find an alternate flight?"] },
  minor: { n: 18, g: 2.0, i: "Other", m: ["How do I book an unaccompanied minor ticket?", "What is the unaccompanied minor fee?", "Can my 12 year old fly as an unaccompanied minor on a connection?"] },
  petcab: { n: 16, g: 1.7, i: "Other", m: ["Can I bring my cat in the cabin? Need pet carrier sizes.", "What size pet carrier fits under the seat?", "Is there a fee for a pet carrier in the cabin?"] },
  misc: { n: 34, g: 1, i: "Other", m: ["What time does check-in open for international flights?", "Can I change the name on my reservation?", "I need a receipt for my last trip.", "How early should I get to the airport?", "Do you have flights to Lisbon in March?", "Can I add my known traveler number?", "What is the carry-on size limit?", "How do I select a meal?", "Is my flight on time?", "Hi", "Talk to a person please."] },
};
const chats = [];
let cid = 1;
for (const t of Object.values(CHAT)) for (let i = 0; i < t.n; i++) {
  const handed = rand() < (t.i === "Rebook" || t.i === "Refund" ? 0.55 : 0.25);
  chats.push({ conversation_id: `CB-${String(810000 + cid++)}`, started_at: when(t.g), channel: pick(["web", "ios", "android"]), intent: t.i, customer_message: pick(t.m), turns: 2 + Math.floor(rand() * 9), handed_to_agent: handed, resolved: !handed && rand() < 0.8 });
}
chats.sort((a, b) => b.started_at.localeCompare(a.started_at));
writeFileSync(join(out, "chatbot-transcripts-sample.json"), JSON.stringify({ bot: "Booking & rebooking assistant", exported: "2026-11-18", conversations: chats }, null, 1) + "\n");

console.log(`Wrote ${rows.length} tickets, ${reviews.length} reviews, ${nps.length} NPS responses, ${chats.length} chats to ${out}`);
