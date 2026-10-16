// Parses README.md (the single source of truth) into structured tool entries.
// Shared by build.mjs (site generation) and check.mjs (sync validation).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Top-level sections that are documentation, not catalog content. */
const EXCLUDED_SECTIONS = new Set([
  "About Awesome Tools",
  "Free-Access Labels",
  "Contents",
  "Popular Free Alternatives",
  "Privacy and Safety Notes",
  "Contributing",
  "Verification and Maintenance Policy",
  "Disclaimer",
]);

/** The nine controlled free-access labels from the README label guide. */
export const ACCESS_LABELS = [
  { id: "free", name: "Free" },
  { id: "open-source", name: "Open source" },
  { id: "free-tier", name: "Free tier" },
  { id: "free-credits", name: "Free credits" },
  { id: "local-offline", name: "Local/offline" },
  { id: "open-weights", name: "Open weights" },
  { id: "student-offer", name: "Student offer" },
  { id: "limited-free", name: "Limited free" },
  { id: "free-personal", name: "Free for personal use" },
];

// Ordered, most-specific first. A label token is classified only when the
// whole token matches — never inferred from "it has a free account".
const LABEL_RULES = [
  [/^open weights$/i, "open-weights"],
  [/^open source$/i, "open-source"],
  [/^free tier( on .+)?$/i, "free-tier"],
  [/^free credits?( daily| on signup)?$/i, "free-credits"],
  [/^free for personal use$/i, "free-personal"],
  [/^student offer$/i, "student-offer"],
  [/^limited free$/i, "limited-free"],
  [/^local\/offline$/i, "local-offline"],
  [/^free forever( on .+)?$/i, "free"],
  [/^free$/i, "free"],
];

// Broad but still literal: the token itself starts by claiming the label
// (e.g. "Open source core", "Free web editor"). These add the tag AND keep
// the original wording as a note, so no detail from the README is lost.
const BROAD_RULES = [
  [/^open source\b/i, "open-source"],
  [/^free\b/i, "free"],
];

const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents (résumé -> resume)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const nameSlugCounts = new Map();
function uniqueId(name) {
  const base = slugify(name) || "tool";
  const n = (nameSlugCounts.get(base) ?? 0) + 1;
  nameSlugCounts.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

function classifyLabels(bold) {
  const tags = [];
  const notes = [];
  for (const raw of bold.split("·")) {
    const token = raw.trim().replace(/\.$/, "");
    if (!token) continue;
    const rule = LABEL_RULES.find(([re]) => re.test(token));
    if (rule) {
      if (!tags.includes(rule[1])) tags.push(rule[1]);
      continue;
    }
    const broad = BROAD_RULES.find(([re]) => re.test(token));
    if (broad) {
      if (!tags.includes(broad[1])) tags.push(broad[1]);
      notes.push(token);
    } else {
      notes.push(token);
    }
  }
  return { tags, notes };
}

/**
 * Parse the README into:
 *   { categories: [...], tools: [...], stats: {...}, warnings: [...] }
 */
export function parseReadme(readmePath = join(ROOT, "README.md")) {
  const text = readFileSync(readmePath, "utf8");
  const lines = text.split(/\r?\n/);

  const warnings = [];
  const tools = [];
  const categories = [];
  const sectionIndex = new Map(); // name -> category object

  let category = null;
  let subcategory = null;
  let inFence = false;

  const entryRe = /^-\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*[-\u2013\u2014]\s+(.+)$/;
  const headingRe = /^(#{2,3})\s+(.+?)\s*$/;

  for (const line of lines) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const h = line.match(headingRe);
    if (h) {
      const level = h[1].length;
      const title = h[2];
      if (level === 2) {
        if (EXCLUDED_SECTIONS.has(title)) {
          category = null;
          subcategory = null;
        } else {
          category = { name: title, id: slugify(title), subcategories: [], toolCount: 0 };
          sectionIndex.set(title, category);
          subcategory = null;
        }
      } else if (category) {
        subcategory = { name: title, id: slugify(title), toolCount: 0 };
        category.subcategories.push(subcategory);
      }
      continue;
    }

    if (!category) continue;

    const m = line.match(entryRe);
    if (!m) continue;

    const [, name, url, rest] = m;

    // The trailing **bold** block holds the access labels; the rest is the description.
    const bold = rest.match(/^(.*?)\s*\*\*([^*]+)\*\*\s*$/);
    if (!bold) {
      warnings.push(`No bold label block: ${name}`);
      continue;
    }
    const description = bold[1].trim();
    const { tags, notes } = classifyLabels(bold[2]);
    if (tags.length === 0) warnings.push(`No recognised access label: ${name} :: ${bold[2]}`);

    const tool = {
      id: uniqueId(name),
      name,
      url,
      description,
      tags,
      notes,
      label: bold[2].trim().replace(/\.$/, ""),
      categoryId: category.id,
      category: category.name,
      subcategoryId: subcategory ? subcategory.id : null,
      subcategory: subcategory ? subcategory.name : null,
    };
    tools.push(tool);
    category.toolCount += 1;
    if (subcategory) subcategory.toolCount += 1;
  }

  for (const [, cat] of sectionIndex) {
    if (cat.toolCount === 0) warnings.push(`Section with no tools: ${cat.name}`);
    categories.push(cat);
  }

  // Duplicate detection
  const seenUrl = new Map();
  const seenName = new Map();
  for (const t of tools) {
    if (seenUrl.has(t.url)) {
      warnings.push(`Duplicate URL: ${t.name} and ${seenUrl.get(t.url)} -> ${t.url}`);
    } else seenUrl.set(t.url, t.name);
    if (seenName.has(t.name.toLowerCase())) {
      warnings.push(`Duplicate name: ${t.name}`);
    } else seenName.set(t.name.toLowerCase(), t.name);
  }

  const tagCounts = Object.fromEntries(ACCESS_LABELS.map((l) => [l.id, 0]));
  for (const t of tools) for (const tag of t.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;

  const stats = {
    tools: tools.length,
    categories: categories.length,
    subcategories: categories.reduce((n, c) => n + c.subcategories.length, 0),
    openSource: tagCounts["open-source"],
    freeTier: tagCounts["free-tier"],
    localOffline: tagCounts["local-offline"],
    labels: tagCounts,
  };

  return { categories, tools, stats, warnings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { categories, tools, stats, warnings } = parseReadme();
  console.log("== parse report ==");
  console.log(`tools: ${tools.length}  categories: ${categories.length}  subcategories: ${stats.subcategories}`);
  console.log("per-category:", categories.map((c) => `${c.name}=${c.toolCount}`).join(", "));
  console.log(`warnings: ${warnings.length}`);
  for (const w of warnings) console.log("  ! " + w);
}
