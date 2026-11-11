// Mock-data packs. Each client (AA, FedEx, UPS…) is one folder of JSON files with the same shape.
// Adding a pack = copy the aa/ folder, change the content, and register it below.
const files = import.meta.glob("./*/*.json", { eager: true, import: "default" });

export const PACKS = [...new Set(Object.keys(files).map((p) => p.split("/")[1]))];

export function loadPack(packId) {
  const pack = {};
  for (const [path, data] of Object.entries(files)) {
    const [, id, file] = path.split("/");
    if (id === packId) pack[file.replace(".json", "")] = data;
  }
  if (!pack.workspace) throw new Error(`Unknown data pack: ${packId}`);
  return pack;
}
