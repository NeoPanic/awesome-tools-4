# Research and Verification Notes — October 2026 Expansion (3.0)

This file records how the October 2026 expansion of Awesome Tools was researched,
verified and merged. It exists so readers can judge the list's provenance instead
of taking it on trust. Run date: **2026-10-16**.

## What changed in this pass

| Metric | Before | After |
| --- | ---: | ---: |
| Tool entries | 714 | **1,026** |
| Categories | 15 | 15 |
| Subcategories | 103 | **125** (22 new) |
| Free-access labels | 9 | **10** (added *Free API tier*) |

312 net-new entries were integrated; every one was checked against an official
source during this pass.

## Free-only acceptance policy

A candidate was integrated only if **all** of the following held:

1. **Ongoing free functionality** — a documented free plan, free-forever core,
   open-source licence, or free API quota. Paid-only products, trial-only
   products and credit-starter signups were rejected.
2. **Limits disclosed beside the listing** — the entry's bold label block states
   the restriction (account required, daily caps, device limits, self-hosting
   requirements, and so on).
3. **Open-source labels only with a confirmed licence** — the repository's
   LICENSE file was read (typically via `cdn.jsdelivr.net/gh/…@latest/LICENSE`,
   `raw.githubusercontent.com` or the GitHub API) before the label was applied.
   Source-available licences (FSL, BUSL, custom "NOASSERTION") were **not**
   counted as open source.
4. **Official-source verification** — claims came from the vendor's own site,
   pricing page, documentation or repository — not from affiliate blogs or
   aggregator copy.
5. **Excluded when unverifiable** — if an official source could not be reached
   or did not document the free tier, the entry was dropped rather than guessed.

## Method

Eight parallel discovery passes researched one task domain each, emitting JSON
evidence files (archived in [`research/`](research/)):

| Pass | Scope | Proposed | Rejected |
| --- | --- | ---: | ---: |
| `ai-study-education` | Study, tutoring, courses, research, libraries (NotebookLM investigated first, per mandate) | 45 | 10 |
| `ai-chat-coding-local` | AI chat, coding, local/offline models, infrastructure | 44 | 11 |
| `creative-media` | Design, raster/vector, 3D, illustration, colour, stock media | 33 | 12 |
| `web-file-utilities` | Hosting, forms, analytics, DNS, PDF/OCR, converters, calculators | 36 | 21 |
| `security-privacy-os` | Passwords, VPN, privacy browsers, hardening, OS utilities | 45 | 11 |
| `productivity-writing` | Notes, tasks, time, email, writing, grammar, docs, chat | 34 | 19 |
| `daily-life-accessibility` | Health, finance, accessibility, everyday utilities, hidden gems | 40 | 10 |
| `dev-tools` | Editors, CI/CD, monitoring, databases, data-viz, scientific computing | 45 | 8 |
| **Total** | | **322** | **102** |

Discovery used task-based query themes ("convert a PDF for free", "check
contrast", "self-host a password manager", "watch a lecture offline" …) drawn
from the existing catalog's task map, plus:

- **Curated free-tool lists** — primarily [`ripienaar/free-for-dev`](https://github.com/ripienaar/free-for-dev),
  used for hosting, CI/CD, monitoring and infrastructure candidates.
- **Gap analysis against the existing catalog** — task areas where the 714-entry
  baseline had no coverage.
- **Repository ecosystems** — GitHub/GitLab project listings for open-source
  candidates, then licence verification on the repository itself.
- **Encyclopedic and announcement sources** — Wikipedia and official
  announcements, used to confirm retirements (see exclusions below).
- **Official portals** — government, nonprofit and university program pages
  (SWAYAM, Open Yale Courses, deSEC, Khan Academy, and similar).
- **Web search integration** — attempted for every task query; it was
  intermittently unavailable during this run, so passes fell back to direct
  low-volume fetches of the official pages above.

Respectful access: single or low-volume fetches of public pages only — no bulk
scraping, no authenticated access, no crawling against robots directives, and
retry with backoff on failure.

In total, verification consulted **213 distinct official domains** (323 source
citations). Every proposed entry records its evidence in the research JSON:
canonical name, official URL, description, category and subcategory, access
labels, restriction note, reference URL (`verified_via`), what the source
actually said (`verified_finding`) and a confidence rating.

Confidence of the 322 proposed entries: **298 high**, **24 medium**, 0 low.
Medium-confidence entries are ones where only partial evidence was obtainable —
for example an exact quota that the vendor does not publish, or a licence
carve-out visible only in a subdirectory (HWiNFO, mitmproxy, LobeChat, Eleventy,
Invoice Ninja, OpenCommit, Scilab). They were kept only where the free-access
claim itself was documented; ambiguous claims were dropped.

## Dedupe

The 322 proposals were normalised against the 714-entry baseline and against
each other (scheme, `www.` and trailing slashes stripped; host + path compared;
names compared case-insensitively). **10 duplicates were removed** → 312 net new.

Cross-agent duplicates and their resolution (first pass in order of priority
won, always placing tools in a long-standing subsection when one existed):

| Tool | Proposed by | Kept from |
| --- | --- | --- |
| AnythingLLM, Khoj | ai-study + ai-chat | ai-study |
| Monkeytype, MyStudyLife | ai-study + daily-life | ai-study |
| WebAIM Contrast Checker, WhoCanUse | creative + daily-life | creative |
| crontab.guru | web-file + daily-life | web-file |
| healthchecks.io, DuckDNS | web-file + dev-tools | web-file (existing DNS/uptime subsection) |

One catalog duplicate slipped through an agent's own dedupe and was caught at
merge time: **Eraser** (already listed).

## Notable exclusions

102 candidates were researched and rejected:

| Reason | Count |
| --- | ---: |
| Already listed, or out of scope for its section | 20 |
| Retired, discontinued, archived or shut down | 20 |
| Trial-only, paid-only or credit-gated | 23 |
| Unverifiable (unreachable, 404/403, TLS failure, client-rendered pricing) | 22 |
| Licence claim inaccurate (not genuinely open source) | 6 |
| Region-gated, superseded or too limited to state honestly | 11 |

Highlights:

- **Microsoft Math Solver — excluded, it was retired.** Microsoft ended the app
  and site on **July 7, 2025** (confirmed via Microsoft's own @MicrosoftMath
  announcement and Wikipedia). `math.microsoft.com` still serves a
  JavaScript shell page, which is not a working product.
- **Screely.com — domain warning.** The mockup tool's domain now serves
  unrelated Thai gambling/spam content. Do not visit it; the entry was rejected.
- **Socratic by Google** — gone as a standalone product; redirects to Google
  Lens, which was added instead.
- **Dead or discontinued**: Freenom free domains, Glitch hosting, Omnivore,
  Google Jamboard, Buypass Go SSL, Macrium Reflect Free for new users, Focalboard,
  Typora-as-free, SimpleScreenRecorder, AudioMass, Gravit Designer.
- **No ongoing free tier**: Mullvad VPN (paid only), Charles Proxy and
  Fiddler Everywhere (trials), YNAB, Roam Research, Heptabase (subscriptions),
  LastPass free (single device type — too restricted to present), Gitpod/Ona,
  Brainly, Mindgrasp.
- **Licence inaccuracies**: GitButler (FSL source-available), Microsoft AutoGen
  (CC-BY-4.0 documentation licence), Mastra (custom licence), Online Tools
  (generated site files explicitly not licensed for reuse).
- **Unverifiable when checked**: Cirrus CI (TLS certificate failure), Logflare
  (404 pricing, 403 homepage), Power Thesaurus (403), Interview Warmup (404),
  VMware Workstation Pro personal-use terms (login wall), Apify (credits whose
  recurrence could not be confirmed officially).

## NotebookLM (investigated first, per the mandate)

NotebookLM **qualifies** and was already listed under *Artificial Intelligence →
AI summarization and document analysis*. Findings from official sources
(`notebooklm.google/plans`, Google support documentation) as of 2026-10-16:

- Renamed **Gemini Notebook** in July 2026; the NotebookLM name and URL remain.
- Free tier with a Google account, no card: 100 notebooks, 50 sources per
  notebook (up to 500k words / 200 MB each), roughly 50 chat queries per day,
  3 Audio Overviews and 3 Video Overviews per day, 10 Reports / Flashcards /
  Quizzes / Mind Maps per day, and 10 Deep Research runs per month.
- Watermark removal and higher limits are paid (Ultra).

The catalog entry was refreshed with these limits. The directory remains
general-purpose: NotebookLM did not make the catalog AI-only.

## Verification metadata in README.md

- Sections edited in this pass carry a hidden HTML comment directly after their
  heading: `<!-- verified: 2026-10-16 -->`.
- Sections without a marker default to **2026-10** — the month of the original
  catalog verification pass. The marker is section-level, not a claim that each
  link was re-clicked on the marked date.
- The build (`scripts/build.mjs`) copies these dates into `docs/data/catalog.json`
  so the site's data carries the same provenance.

**Honest limits:** entries added in this pass were individually verified against
the sources recorded in `research/*.json`. Pre-existing entries were not
re-verified one by one during this pass; they keep their baseline October 2026
date. Nothing in this repository claims that all 1,026 links were hand-checked
on 2026-10-16.

## Reproducing the merge

```bash
node scripts/integrate-research.mjs --dry   # preview: dedupe, placement, skips
node scripts/integrate-research.mjs         # write README.md
node scripts/parse-readme.mjs               # parse report (warnings must be 0)
node scripts/build.mjs                      # regenerate docs/data + docs/js
node scripts/build.mjs --check              # sync gate (README is source of truth)
```

`integrate-research.mjs` is idempotent: re-running against an updated catalog
dedupes everything already merged.
