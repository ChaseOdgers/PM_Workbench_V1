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
console.log(`Wrote ${rows.length} tickets and ${reviews.length} reviews to ${out}`);
