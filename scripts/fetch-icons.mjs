// One-time icon source fetcher. Downloads SVG sources into scripts/icon-sources/
// so that site builds are fully offline-reproducible. Committed to the repo.
//   - Lucide (ISC license)  -> minimal line icons, consistent 24px grid / 2px stroke
//   - Simple Icons (CC0)    -> official brand marks for well-known tools
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "icon-sources");
const LUCIDE_VER = "1.57.0";
const SIMPLE_VER = "15.6.0";

const LUCIDE = [
  "search","sparkles","cpu","code","code-xml","globe","list-todo","square-check",
  "pen-line","file-pen-line","palette","clapperboard","wrench","screwdriver","files",
  "shield","monitor","monitor-cog","graduation-cap","briefcase","gem","scale",
  "message-circle","bot","workflow","spell-check","pen","file-text","mic","languages",
  "table","sheet","table-2","flask-conical","sigma","layers","brain","presentation",
  "image","images","wand-sparkles","film","scissors","music","music-2","audio-lines",
  "captions","subtitles","layout-template","layout-grid","package","laptop","boxes",
  "server","file-code","terminal","book-open","braces","git-branch","plug","database",
  "cloud","shield-check","regex","app-window","layout","rss","list-checks",
  "bar-chart-3","chart-column","activity","mail","repeat","notebook-pen","sticky-note",
  "calendar-check","timer","bookmark","network","pen-tool","inbox","video","text",
  "book-marked","frame","component","type","swatch-book","droplet","camera","box",
  "gamepad-2","radio","arrow-left-right","replace","headphones","play","library",
  "scan-text","qr-code","fingerprint","calculator","key-round","lock","eye-off","ban",
  "shield-alert","bug","flag","screen-share","atom","microscope","map","accessibility",
  "circle-help","help-circle","folder-search","star","shuffle","copy","share-2",
  "external-link","moon","sun","filter","rotate-ccw","menu","x","chevron-down",
  "chevron-right","chevron-up","info","link","history","check","arrow-up-down","home",
  "hash","compass","rocket","target","gauge","puzzle","paintbrush","crop","lightbulb",
  "users","git-fork","book","newspaper","file-check","circle-check","circle-x",
  "folder","folder-open","hard-drive","wifi","smartphone","gamepad","brush","stamp",
  "split","trending-up","calendar","clock","at-sign","globe-2","send","paperclip",
];

// Official brand marks (Simple Icons). Key = exact tool name in the README.
import { BRAND_TOOLS } from "./icon-map.mjs";
const BRANDS = BRAND_TOOLS;

// ---------------------------------------------------------------------------
async function grab(url) {
  const res = await fetch(url, { headers: { "user-agent": "awesome-tools-build" } });
  if (!res.ok) return null;
  return res.text();
}

function inner(svg) {
  const m = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>\s*$/);
  if (!m) return null;
  return m[1]
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

async function mapLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

const lucideDir = join(SRC, "lucide");
const brandDir = join(SRC, "brands");
mkdirSync(lucideDir, { recursive: true });
mkdirSync(brandDir, { recursive: true });

const lucideMissing = [];
await mapLimit([...new Set(LUCIDE)], 12, async (name) => {
  const out = join(lucideDir, `${name}.svg`);
  if (existsSync(out)) return;
  const svg = await grab(`https://cdn.jsdelivr.net/npm/lucide-static@${LUCIDE_VER}/icons/${name}.svg`);
  if (!svg || !inner(svg)) { lucideMissing.push(name); return; }
  writeFileSync(out, svg);
});

const slugs = [...new Set(Object.values(BRANDS))];
const brandMissing = [];
await mapLimit(slugs, 12, async (slug) => {
  const out = join(brandDir, `${slug}.svg`);
  if (existsSync(out)) return;
  const svg = await grab(`https://cdn.jsdelivr.net/npm/simple-icons@${SIMPLE_VER}/icons/${slug}.svg`);
  if (!svg || !inner(svg)) { brandMissing.push(slug); return; }
  writeFileSync(out, svg);
});

console.log(`lucide ok: ${LUCIDE.length - lucideMissing.length}/${LUCIDE.length}`);
if (lucideMissing.length) console.log("  lucide missing: " + lucideMissing.join(", "));
console.log(`brands ok: ${slugs.length - brandMissing.length}/${slugs.length}`);
if (brandMissing.length) console.log("  brand missing: " + brandMissing.join(", "));
