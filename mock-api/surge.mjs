// Inject new records into the running mock API, mid-demo.
//   npm run surge -- pets 25                         25 new Salesforce cases about pets
//   npm run surge -- wifi 30 medallia/responses      30 Medallia responses about Wi-Fi (a theme the app doesn't know yet)
//   npm run surge -- list                            what you can surge
//   npm run surge -- reset                           back to the data on disk
const [a = "pets", b = "25", c = "salesforce/cases"] = process.argv.slice(2);
const base = process.env.MOCK_API_URL || `http://localhost:${process.env.PORT || 4010}`;
const url = a === "list" ? `${base}/v1/_demo/themes` : a === "reset" ? `${base}/v1/_demo/reset`
  : `${base}/v1/_demo/surge?theme=${encodeURIComponent(a)}&n=${Number(b) || 25}&endpoint=${encodeURIComponent(c)}`;
try {
  const r = await (await fetch(url)).json();
  if (r.error) { console.error(`✗ ${r.error}`); process.exit(1); }
  if (a === "list") console.log(`Themes: ${r.themes.join(", ")}\nSystems: ${r.endpoints.join(", ")}`);
  else if (a === "reset") console.log("✓ Mock API reset to the data on disk");
  else console.log(`✓ Added ${r.added} new “${r.theme}” records to ${r.endpoint} (${r.total} total). The watcher agent picks them up on its next check.`);
} catch {
  console.error(`✗ Can't reach the mock API at ${base}. Start it first: npm run mock-api`);
  process.exit(1);
}
