// scripts/search.mjs
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is required");

const storeName = process.env.GEMINI_FILE_SEARCH_STORE; // e.g. fileSearchStores/xxxx
if (!storeName) throw new Error("GEMINI_FILE_SEARCH_STORE is required (e.g. fileSearchStores/xxxx)");

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const queryParts = argv.filter((a) => !a.startsWith("--"));
const query = queryParts.join(" ").trim();

if (!query) {
  console.error('Usage: node scripts/search.mjs "質問文" [--debug|--raw]');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

const res = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: query,
  config: {
    tools: [
      {
        fileSearch: {
          fileSearchStoreNames: [storeName],
        },
      },
    ],
  },
});

console.log("\n=== ANSWER ===\n");
console.log(res.text ?? "(no text)");

const gm = res?.candidates?.[0]?.groundingMetadata;
if (!gm) process.exit(0);

if (flags.has("--raw")) {
  console.log("\n=== GROUNDING METADATA (raw) ===\n");
  console.log(JSON.stringify(gm, null, 2));
  process.exit(0);
}

if (!flags.has("--debug")) process.exit(0);

// -------- pretty debug (readable) --------

const normalize = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();

const truncate = (s, n = 220) => {
  const t = normalize(s);
  return t.length > n ? t.slice(0, n) + "…" : t;
};

const chunks = (gm.groundingChunks ?? [])
  .map((c, i) => {
    const rc = c?.retrievedContext ?? {};
    return {
      idx: i,
      title: rc.title ?? "(no title)",
      store: rc.fileSearchStore ?? "",
      text: rc.text ?? "",
      snippet: truncate(rc.text ?? "", 260),
    };
  });

const supports = (gm.groundingSupports ?? [])
  .map((s, i) => {
    const segText = s?.segment?.text ?? "";
    const inds = s?.groundingChunkIndices ?? [];
    return {
      idx: i,
      segment: truncate(segText, 180),
      chunkIndices: inds,
    };
  });

console.log("\n=== SOURCES (pretty) ===\n");

// 1) chunks list (unique titles)
for (const c of chunks) {
  console.log(`- [${c.idx}] ${c.title}`);
  if (c.snippet) console.log(`    ${c.snippet}`);
}

// 2) which segment is supported by which chunk
if (supports.length) {
  console.log("\n=== SUPPORTS (which sentence comes from where) ===\n");
  for (const s of supports) {
    const refs = s.chunkIndices
      .map((ci) => {
        const t = chunks[ci]?.title ?? `chunk#${ci}`;
        return `${ci}:${t}`;
      })
      .join(", ");
    console.log(`- (${s.idx}) "${s.segment}"`);
    console.log(`    ↳ ${refs || "(no refs)"}`);
  }
}
