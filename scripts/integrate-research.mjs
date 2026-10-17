// One-shot maintainer tool: merges verified research results (research/*.json
// from the upgrade-3.0 discovery run) into README.md, the single source of
// truth. Safe to re-run: already-integrated entries dedupe against the current
// catalog, and verified markers / label rows / TOC lines are inserted once.
//
// Usage: node scripts/integrate-research.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseReadme, ACCESS_LABELS } from "./parse-readme.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const README = join(ROOT, "README.md");
const CATALOG = join(ROOT, "docs", "data", "catalog.json");
const RESEARCH_DIR = process.env.RESEARCH_DIR || "C:\\Users\\krita\\AppData\\Local\\Temp\\opencode\\research";
const DRY = process.argv.includes("--dry");
const TODAY = "2026-10-16";

// Agent run order decides who wins when two agents propose the same tool.
// Placements in existing subcategories always beat proposed new ones via the
// domain/name dedupe (first proposal wins), so ordering matters:
// web-file-utilities runs before dev-tools so healthchecks.io and DuckDNS
// land in the long-standing "Uptime monitoring, DNS and domains" subsection.
const AGENT_ORDER = [
  "ai-study-education",
  "ai-chat-coding-local",
  "creative-media",
  "web-file-utilities",
  "security-privacy-os",
  "productivity-writing",
  "daily-life-accessibility",
  "dev-tools",
];

// Sections that stay flat (no subcategories) — Hidden Gems has always been a
// curated grab-bag; new entries join it without inventing structure.
const FLAT_CATEGORIES = new Set(["Hidden Gems"]);

const LABEL_NAME = Object.fromEntries(ACCESS_LABELS.map((l) => [l.id, l.name]));
const LABEL_ORDER = ACCESS_LABELS.map((l) => l.id);

const slugify = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const normUrl = (u) => {
  try {
    const x = new URL(u);
    return x.host.toLowerCase().replace(/^www\./, "") + x.pathname.replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(u).toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  }
};
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
// Keep the agent's own wording and casing (proper nouns like "Windows 10"
// survive); only normalise spacing, stray separators and the trailing period
// so the bold block can end with a single full stop.
const fragment = (s) => clean(s).replace(/·/g, ",").replace(/\.$/, "");

// ---- load current catalog for dedupe --------------------------------------
const cat = JSON.parse(readFileSync(CATALOG, "utf8"));
const seenUrl = new Set(cat.tools.map((t) => normUrl(t.url)));
const seenName = new Set(cat.tools.map((t) => t.name.toLowerCase()));
const inRunUrl = new Set(), inRunName = new Set(); // proposed earlier in this run

// ---- load research files ---------------------------------------------------
const files = readdirSync(RESEARCH_DIR).filter((f) => f.endsWith(".json"));
const byAgent = new Map();
for (const f of files) {
  const data = JSON.parse(readFileSync(join(RESEARCH_DIR, f), "utf8"));
  const agent = data.agent || f.replace(/\.json$/, "");
  const list = (data.included || []).map((e) => ({
    ...e,
    subcategory: e.subcategory || e.sub || "",
    url: e.url || e.website_url || "",
    labels: Array.isArray(e.labels) ? e.labels : e.label ? [e.label] : [],
  }));
  byAgent.set(agent, list);
}
const missingAgents = AGENT_ORDER.filter((a) => !byAgent.has(a));
const extraAgents = [...byAgent.keys()].filter((a) => !AGENT_ORDER.includes(a));
if (missingAgents.length) console.log(`! no results for: ${missingAgents.join(", ")}`);
if (extraAgents.length) console.log(`! unordered agents (appended last): ${extraAgents.join(", ")}`);
const agents = [...AGENT_ORDER, ...extraAgents].filter((a) => byAgent.has(a));

// ---- README structure ------------------------------------------------------
const { categories } = parseReadme(README);
const catIndex = new Map(categories.map((c, i) => [c.name, i]));
const subSlug = new Map(); // "catId/subId" -> name
for (const c of categories) for (const s of c.subcategories) subSlug.set(`${c.id}/${s.id}`, s.name);

// ---- select + dedupe entries ----------------------------------------------
const rejected = [];
const plan = new Map(); // "catName\u0000subName" -> [entryLine]
const newSubs = new Map(); // catName -> [subName] in insertion order

const addEntry = (key, line) => {
  if (!plan.has(key)) plan.set(key, []);
  plan.get(key).push(line);
};

let taken = 0;
for (const agent of agents) {
  for (const e of byAgent.get(agent)) {
    const name = clean(e.name);
    const url = clean(e.url);
    const catName = clean(e.category);
    if (!name || !url || !catName) { rejected.push([name || "(unnamed)", "missing name/url/category"]); continue; }

    const u = normUrl(url);
    const n = name.toLowerCase();
    if (seenUrl.has(u)) { rejected.push([name, inRunUrl.has(u) ? "cross-agent dupe (url)" : "already in catalog (url)"]); continue; }
    if (seenName.has(n)) { rejected.push([name, inRunName.has(n) ? "cross-agent dupe (name)" : "already in catalog (name)"]); continue; }
    // near-duplicate URL of another agent's proposal (github vs product site etc.)
    const host = u.split("/")[0];
    const clash = [...seenUrl].some((x) => x.split("/")[0] === host && x.split("/").length > 1 && u.split("/").slice(1).join("/") === x.split("/").slice(1).join("/"));
    if (clash) { rejected.push([name, "near-duplicate url"]); continue; }
    seenUrl.add(u); seenName.add(n); inRunUrl.add(u); inRunName.add(n); taken += 1;

    if (!catIndex.has(catName)) { rejected.push([name, `unknown category "${catName}"`]); continue; }

    // labels
    const labelTokens = [];
    for (const id of LABEL_ORDER) if (e.labels.includes(id)) labelTokens.push(LABEL_NAME[id]);
    for (const id of e.labels) if (!LABEL_NAME[id]) console.log(`! ${name}: unknown label "${id}" ignored`);
    if (!labelTokens.length) { console.log(`! ${name}: no recognised label — using "Limited free"`); labelTokens.push("Limited free"); }
    const note = fragment(e.note);
    const desc = fragment(e.description); // strips trailing period, normalises spacing
    const bold = [...labelTokens, ...(note ? [note] : [])].join(" · ") + ".";
    const line = `- [${name}](${url}) — ${desc}. **${bold}**`;

    // subcategory
    const flat = FLAT_CATEGORIES.has(catName);
    let subName = "";
    if (!flat) {
      let sub = clean(e.subcategory).replace(/^NEW:\s*/, "");
      const c = categories[catIndex.get(catName)];
      const hit = c.subcategories.find((s) => slugify(s.name) === slugify(sub));
      if (hit) subName = hit.name;
      else {
        subName = sub;
        const key = `${catName}\u0000${subName}`;
        if (!newSubs.has(catName)) newSubs.set(catName, []);
        if (!newSubs.get(catName).includes(subName)) newSubs.get(catName).push(subName);
        // register so later agents match against it too
        subSlug.set(`${c.id}/${slugify(subName)}`, subName);
        c.subcategories.push({ id: slugify(subName), name: subName, toolCount: 0 });
      }
    }
    addEntry(`${catName}\u0000${subName}`, line);
  }
}

// ---- emit: markers, entries, new sections, TOC ----------------------------
const text = readFileSync(README, "utf8");
const crlf = text.includes("\r\n");
const lines = text.split(/\r?\n/);

// find heading lines + section end (last non-blank line before next heading)
const headingAt = []; // idx -> {level, title, catIdx, subIdx}
let curCat = -1, curSub = -1;
for (let i = 0; i < lines.length; i++) {
  const h = lines[i].match(/^(#{2,3})\s+(.+?)\s*$/);
  if (!h) continue;
  if (h[1].length === 2) {
    const ci = catIndex.has(h[2]) ? categories.findIndex((c) => c.name === h[2]) : -1;
    curCat = ci; curSub = -1;
    headingAt[i] = { level: 2, title: h[2], catIdx: ci, subIdx: -1 };
  } else if (curCat >= 0) {
    const c = categories[curCat];
    curSub = c.subcategories.findIndex((s) => s.name === h[2]);
    headingAt[i] = { level: 3, title: h[2], catIdx: curCat, subIdx: curSub };
  }
}
const headingIdx = Object.keys(headingAt).map(Number).sort((a, b) => a - b);
const sectionEnd = new Map(); // headingIdx -> idx of last non-blank line
for (let k = 0; k < headingIdx.length; k++) {
  const start = headingIdx[k];
  const stop = headingIdx[k + 1] ?? lines.length;
  let end = stop - 1;
  while (end > start && lines[end].trim() === "") end--;
  sectionEnd.set(start, end);
}

const injectAfter = new Map(); // lineIdx -> [lines to insert after it]
const push = (idx, arr) => {
  if (!injectAfter.has(idx)) injectAfter.set(idx, []);
  injectAfter.get(idx).push(...arr);
};

const VERIFIED = `<!-- verified: ${TODAY} -->`;
const needsMarker = new Set(); // "cat\u0000sub" sections that got entries

for (const [key, entries] of plan) {
  const [catName, subName] = key.split("\u0000");
  const catIdx = categories.findIndex((c) => c.name === catName);
  // locate the heading line for this section
  let hIdx = -1;
  for (const i of headingIdx) {
    const h = headingAt[i];
    if (h.catIdx !== catIdx) continue;
    if (subName === "" ? h.level === 2 : h.level === 3 && categories[catIdx].subcategories[h.subIdx]?.name === subName) { hIdx = i; break; }
  }
  if (hIdx < 0) { console.log(`! no heading found for ${catName} / ${subName || "(flat)"}`); continue; }
  // marker right after heading (only if not already present)
  const after = lines[hIdx + 1]?.trim() ?? "";
  if (after !== VERIFIED) push(hIdx, [VERIFIED]);
  // entries at section end
  const end = sectionEnd.get(hIdx);
  push(end, ["", ...entries]);
  needsMarker.add(key);
}

// new subsections go at the end of their category (before the next ## heading)
for (const [catName, subs] of newSubs) {
  const catIdx = categories.findIndex((c) => c.name === catName);
  // last heading belonging to this category
  let lastHeading = -1;
  for (const i of headingIdx) if (headingAt[i].catIdx === catIdx) lastHeading = i;
  if (lastHeading < 0) continue;
  const end = sectionEnd.get(lastHeading);
  const block = [];
  for (const subName of subs) {
    const entries = plan.get(`${catName}\u0000${subName}`) || [];
    if (!entries.length) continue;
    block.push("", `### ${subName}`, VERIFIED, "", ...entries);
    needsMarker.add(`${catName}\u0000${subName}`);
  }
  if (block.length) push(end, block);
}

const out = [];
for (let i = 0; i < lines.length; i++) {
  out.push(lines[i]);
  if (injectAfter.has(i)) out.push(...injectAfter.get(i));
}

// ---- Contents TOC: add lines for new subcategories -------------------------
let readmeOut = out.join(crlf ? "\r\n" : "\n");
for (const [catName, subs] of newSubs) {
  if (!subs.length) continue;
  const catLine = `- [${catName}](#${slugify(catName)})`;
  const start = readmeOut.indexOf(catLine);
  if (start < 0) { console.log(`! TOC: category line missing for ${catName}`); continue; }
  // end of this TOC block = next "- [" at column 0 or a blank-then-heading
  const after = readmeOut.indexOf("\n- [", start + 1);
  const blockEnd = after < 0 ? readmeOut.indexOf("\n\n", start) : after;
  const anchorPoint = after < 0 ? blockEnd : after; // insert before next category
  const tocLines = subs.map((s) => `  - [${s}](#${slugify(s)})`).join(crlf ? "\r\n" : "\n");
  readmeOut = readmeOut.slice(0, anchorPoint) + (crlf ? "\r\n" : "\n") + tocLines + readmeOut.slice(anchorPoint);
}

// ---- label guide table: add Free API tier row -----------------------------
if (!readmeOut.includes("| **Free API tier**")) {
  const row = "| **Free tier** |";
  const i = readmeOut.indexOf(row);
  if (i >= 0) {
    const lineEnd = readmeOut.indexOf("\n", i);
    readmeOut = readmeOut.slice(0, lineEnd + 1) +
      "| **Free API tier** | A continuing free API quota published by the provider — a documented rate limit, not trial credits. |\r\n".replace(/\r\n$/, crlf ? "\r\n" : "\n") +
      readmeOut.slice(lineEnd + 1);
    console.log("+ label guide row: Free API tier");
  } else console.log("! label guide: Free tier row not found");
}

// ---- report ----------------------------------------------------------------
console.log(`\nentries accepted: ${taken}`);
const grouped = new Map();
for (const [k, v] of plan) {
  const [c, s] = k.split("\u0000");
  grouped.set(c, (grouped.get(c) || 0) + v.length);
}
for (const [c, n] of grouped) console.log(`  ${c}: +${n}`);
if (newSubs.size) {
  console.log("new subsections:");
  for (const [c, subs] of newSubs) for (const s of subs) console.log(`  ${c} > ${s}`);
}
console.log(`skipped: ${rejected.length}`);
const byReason = new Map();
for (const [n, r] of rejected) {
  const k = r.replace(/\(.*\)/, "").trim();
  if (!byReason.has(k)) byReason.set(k, []);
  byReason.get(k).push(n);
}
for (const [r, names] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${names.length}x ${r}`);
  if (r !== "already in catalog") console.log(`      ${names.slice(0, 12).join(", ")}${names.length > 12 ? " ..." : ""}`);
}

if (!DRY) {
  // Always commit LF (repo blob format); CRLF would fake a full-file rewrite.
  writeFileSync(README, readmeOut.replace(/\r\n/g, "\n"));
  console.log(`\nREADME.md updated (${readmeOut.split(/\r?\n/).length} lines).`);
} else {
  console.log("\n(dry run — README not written)");
}
