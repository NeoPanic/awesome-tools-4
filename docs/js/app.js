/* Awesome Tools — interactive directory.
   Data is generated from README.md by scripts/build.mjs (see --check in CI).
   No frameworks, no trackers, no external requests. */
"use strict";
(function () {
  // ---------------------------------------------------------------- setup
  if (window.AT_ICON_SPRITE) {
    document.body.insertAdjacentHTML("afterbegin", window.AT_ICON_SPRITE);
  }

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const icon = (name) =>
    `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem("at:" + k);
        if (v == null) return d;
        try { return JSON.parse(v); } catch (e) { return v; } // tolerate raw values
      } catch (e) { return d; }
    },
    set(k, v) { try { localStorage.setItem("at:" + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  const els = {
    q: $("#q"), searchForm: $("#searchForm"), clearQ: $("#clearQ"),
    heroSlot: $("#heroSearchSlot"), topbarSlot: $("#topbarSearchSlot"),
    home: $("#home"), browse: $("#browse"),
    catTree: $("#catTree"), catFilter: $("#catFilter"),
    allCount: $("#allCount"), favCount: $("#favCount"),
    catGrid: $("#catGrid"), stats: $("#stats"),
    recentBlock: $("#recentBlock"), recentRow: $("#recentRow"), clearRecent: $("#clearRecent"),
    homeQuick: $("#homeQuick"),
    activeChips: $("#activeChips"), quickFilters: $("#quickFilters"),
    resultCount: $("#resultCount"), sortSel: $("#sortSel"), clearAll: $("#clearAll"),
    results: $("#results"), empty: $("#empty"), emptyMsg: $("#emptyMsg"),
    emptyClear: $("#emptyClear"), emptyReset: $("#emptyReset"), didYouMean: $("#didYouMean"),
    showMore: $("#showMore"),
    sidebar: $("#sidebar"), navToggle: $("#navToggle"), navClose: $("#navClose"), backdrop: $("#backdrop"),
    themeBtn: $("#themeBtn"), randomBtn: $("#randomBtn"),
    toast: $("#toast"), brandHome: $("#brandHome"),
  };

  // ---------------------------------------------------------------- data
  let CATALOG = null;
  let TOOLS = [];
  let LABELS = [];
  let catById = new Map(), subById = new Map(), toolById = new Map(), labelById = new Map();

  let favs = new Set(store.get("favs", []));
  let recent = store.get("recent", []);
  const expanded = new Set();

  const state = { q: "", cat: "", sub: "", tags: new Set(), fav: false, all: false, sort: "rel", tool: "" };
  let baseScored = [];   // results after q/cat/sub/fav, before tag facet (for chip counts)
  let renderLimit = 120;
  const PAGE = 120;
  const isMobile = () => window.matchMedia("(max-width: 980px)").matches;

  // ---------------------------------------------------------------- search
  const words = (s) => s.toLowerCase().match(/[\p{L}\p{N}+#]+/gu) || [];

  function wordMatch(qw, hw) {
    if (hw === qw) return true;
    const n = Math.min(4, qw.length, hw.length);
    return n >= 2 && qw.startsWith(hw.slice(0, n)) && hw.startsWith(qw.slice(0, n));
  }

  // levels: 4 name word, 3 name substring, 2 category/subcategory word,
  //         1 rest word, 0 rest substring
  const LVL = { restSub: 0, rest: 1, meta: 2, nameSub: 3, name: 4 };
  const LVL_SCORE = [12, 25, 45, 60, 90];

  function tokenLevel(tok, t) {
    for (const w of t.nw) if (wordMatch(tok, w)) return LVL.name;
    if (t.nameL.includes(tok)) return LVL.nameSub;
    if (t.sw.length) for (const w of t.sw) if (wordMatch(tok, w)) return LVL.meta;
    for (const w of t.rw) if (wordMatch(tok, w)) return LVL.rest;
    if (t.restL.includes(tok)) return LVL.restSub;
    return -1;
  }

  function scoreTool(t, toks, full) {
    let score = 0;
    let allInName = true;
    let subExact = t.subW.length > 0;
    for (const tok of toks) {
      const lvl = tokenLevel(tok, t);
      if (lvl < 0) return -1;
      score += LVL_SCORE[lvl];
      if (lvl < LVL.nameSub) allInName = false;
      if (!t.subW.some((w) => wordMatch(tok, w))) subExact = false;
    }
    // "every word names the subcategory itself" -> strong intent match
    if (subExact) score += 150;
    if (t.nameL === full) score += 1000;
    else if (allInName) score += 200;
    if (t.nameL.startsWith(full)) score += 120;
    return score;
  }

  // ---------------------------------------------------------------- facets
  function passesFacets(t) {
    if (state.cat && t.catId !== state.cat) return false;
    if (state.sub && t.subId !== state.sub) return false;
    if (state.fav && !favs.has(t.id)) return false;
    return true;
  }
  function passesTags(t, required) {
    for (const tag of required) if (!t.tags.includes(tag)) return false;
    return true;
  }

  function computeBase() {
    const toks = words(state.q);
    const full = state.q.trim().toLowerCase();
    const out = [];
    for (const t of TOOLS) {
      if (!passesFacets(t)) continue;
      if (toks.length) {
        const s = scoreTool(t, toks, full);
        if (s < 0) continue;
        out.push({ t, s });
      } else out.push({ t, s: 0 });
    }
    return out;
  }

  function sorted(list) {
    if (state.sort === "az") return list.slice().sort((a, b) => a.t.name.localeCompare(b.t.name));
    if (state.sort === "cat") {
      const ci = new Map(CATALOG.categories.map((c, i) => [c.id, i]));
      return list.slice().sort((a, b) => {
        const d = (ci.get(a.t.catId) ?? 99) - (ci.get(b.t.catId) ?? 99);
        if (d) return d;
        return a.t.name.localeCompare(b.t.name);
      });
    }
    if (state.q) return list.slice().sort((a, b) => b.s - a.s);
    return list;
  }

  // ---------------------------------------------------------------- hash
  function readHash() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ""));
    state.q = p.get("q") || "";
    state.cat = p.get("cat") || "";
    state.sub = p.get("sub") || "";
    state.fav = p.get("fav") === "1";
    state.all = p.get("all") === "1";
    state.sort = ["rel", "az", "cat"].includes(p.get("sort")) ? p.get("sort") : "rel";
    state.tool = p.get("tool") || "";
    state.tags = new Set((p.get("tags") || "").split(",").filter(Boolean));
    // Drop unknown ids from old or mistyped deep links so they land on the
    // real catalog instead of a silent zero-result state with no visible chip.
    if (state.cat && !catById.has(state.cat)) { state.cat = ""; state.sub = ""; }
    if (state.sub && !subById.has(state.sub)) state.sub = "";
    else if (state.sub && state.cat && subById.get(state.sub).catId !== state.cat) state.sub = "";
    if (state.tool && !toolById.has(state.tool)) state.tool = "";
    for (const t of [...state.tags]) if (!labelById.has(t)) state.tags.delete(t);
  }

  function hashString() {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.cat) p.set("cat", state.cat);
    if (state.sub) p.set("sub", state.sub);
    if (state.tags.size) p.set("tags", [...state.tags].join(","));
    if (state.fav) p.set("fav", "1");
    if (state.all) p.set("all", "1");
    if (state.sort !== "rel") p.set("sort", state.sort);
    if (state.tool) p.set("tool", state.tool);
    const s = p.toString();
    return s ? "#" + s : "#";
  }

  function writeHash(mode) {
    if (mode === "none") return;
    const url = location.pathname + location.search + hashString();
    try {
      if (mode === "push") history.pushState(null, "", url);
      else history.replaceState(null, "", url);
    } catch (e) { /* file:// */ }
  }

  const isActive = () =>
    !!(state.q || state.cat || state.sub || state.tags.size || state.fav || state.all || state.tool);

  function resetState() {
    state.q = ""; state.cat = ""; state.sub = ""; state.fav = false;
    state.all = false; state.tool = ""; state.sort = "rel";
    state.tags.clear();
    els.q.value = "";
    els.catFilter.value = "";
    applyFiltersUI();
  }

  function clearToolParam() { state.tool = ""; }

  // ---------------------------------------------------------------- render helpers
  function crumbFor(t) {
    const cat = catById.get(t.catId);
    if (!cat) return "";
    let html = `<button class="crumb" data-crumb="cat" data-id="${esc(cat.id)}">${icon(cat.icon)}${esc(cat.name)}</button>`;
    if (t.subId && subById.has(t.subId)) {
      const sub = subById.get(t.subId);
      html += `<button class="crumb" data-crumb="sub" data-id="${esc(sub.id)}" data-cat="${esc(t.catId)}">${icon(sub.icon)}${esc(sub.name)}</button>`;
    }
    return html;
  }

  function tagsFor(t) {
    const seen = [];
    let html = "";
    for (const tag of t.tags) {
      if (seen.includes(tag)) continue;
      seen.push(tag);
      const l = labelById.get(tag);
      if (!l) continue;
      html += `<span class="tag primary">${icon(l.icon)}${esc(l.name)}</span>`;
    }
    for (const note of t.notes) html += `<span class="tag-note">${esc(note)}</span>`;
    return html;
  }

  function cardHTML(t) {
    const fav = favs.has(t.id);
    return `<article class="card" id="t-${esc(t.id)}" data-id="${esc(t.id)}">
      <span class="tile" aria-hidden="true">${icon(t.icon)}</span>
      <div class="card-main">
        <span class="card-title">
          <a class="card-name" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer"
             data-open="${esc(t.id)}">${esc(t.name)}</a>
        </span>
        <p class="card-desc">${esc(t.description)}</p>
      </div>
      <div class="card-meta">
        ${crumbFor(t)}
        ${tagsFor(t)}
      </div>
      <div class="card-actions">
        <button class="icon-btn fav" type="button" data-fav="${esc(t.id)}" aria-pressed="${fav}"
                aria-label="${fav ? "Remove" : "Add"} ${esc(t.name)} ${fav ? "from" : "to"} favorites"
                title="${fav ? "Remove from favorites" : "Add to favorites"}">${icon("star")}</button>
        <button class="icon-btn" type="button" data-copy="${esc(t.id)}"
                aria-label="Copy a link to ${esc(t.name)}" title="Copy link">${icon("copy")}</button>
        <a class="open-link" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer"
           data-open="${esc(t.id)}">Open${icon("external-link")}</a>
      </div>
    </article>`;
  }

  function renderResults(list) {
    const total = list.length;
    const slice = list.slice(0, renderLimit);
    els.results.innerHTML = slice.map((x) => cardHTML(x.t)).join("");

    const hasQuery = total > 0;
    els.empty.hidden = hasQuery;
    els.results.hidden = !hasQuery;
    if (!hasQuery) renderEmptySuggestion();

    const shown = Math.min(renderLimit, total);
    if (total > shown) {
      els.showMore.hidden = false;
      els.showMore.textContent = `Show ${Math.min(PAGE, total - shown)} more (${total - shown} left)`;
    } else els.showMore.hidden = true;

    els.resultCount.innerHTML = `<strong>${total}</strong> of ${TOOLS.length} tools` +
      (isActive() && total !== TOOLS.length ? " match your filters" : "");
  }

  function renderEmptySuggestion() {
    const toks = words(state.q);
    const relaxed = [];
    for (const t of TOOLS) {
      if (!passesFacets(t)) continue;
      let hit = 0;
      for (const tok of toks) if (tokenLevel(tok, t) >= 0) hit++;
      if (hit) relaxed.push({ t, s: hit });
    }
    relaxed.sort((a, b) => b.s - a.s);

    let picks = relaxed.slice(0, 3).map((x) => x.t);
    if (picks.length < 3 && state.q.trim().length > 1) {
      const scored = TOOLS
        .map((t) => ({ t, d: dice(words(t.name).join(" "), state.q.trim().toLowerCase()) }))
        .filter((x) => x.d > 0.15)
        .sort((a, b) => b.d - a.d);
      for (const x of scored) {
        if (picks.length >= 3) break;
        if (!picks.includes(x.t)) picks.push(x.t);
      }
    }

    if (picks.length) {
      els.didYouMean.innerHTML =
        `<span class="dym-label">Closest matches — try:</span><span class="dym-links">` +
        picks.map((t) => `<button type="button" data-dym="${esc(t.name)}">${icon(t.icon)}${esc(t.name)}</button>`).join("") +
        `</span>`;
      els.didYouMean.hidden = false;
    } else {
      els.didYouMean.hidden = true;
    }
    els.emptyMsg.textContent = state.q
      ? `Nothing matches “${state.q.trim()}” with the current filters. Try fewer words or reset the filters.`
      : "No tools match the current filters. Reset them and start again.";
  }

  function bigrams(s) {
    const out = [];
    const str = s.replace(/\s+/g, "");
    for (let i = 0; i < str.length - 1; i++) out.push(str.slice(i, i + 2));
    return out;
  }
  function dice(a, b) {
    const A = bigrams(a), B = bigrams(b);
    if (!A.length || !B.length) return 0;
    const counts = new Map();
    for (const g of A) counts.set(g, (counts.get(g) || 0) + 1);
    let hit = 0;
    for (const g of B) {
      const c = counts.get(g) || 0;
      if (c > 0) { hit++; counts.set(g, c - 1); }
    }
    return (2 * hit) / (A.length + B.length);
  }

  // ---------------------------------------------------------------- chips & filters
  function renderChips() {
    const chips = [];
    if (state.q) chips.push({ key: "q", icon: "search", label: `“${state.q.trim()}”` });
    if (state.all) chips.push({ key: "all", icon: "list", label: "All tools" });
    if (state.cat) {
      const c = catById.get(state.cat);
      if (c) chips.push({ key: "cat", icon: c.icon, label: c.name });
    }
    if (state.sub) {
      const s = subById.get(state.sub);
      if (s) chips.push({ key: "sub", icon: s.icon, label: s.name });
    }
    for (const tag of state.tags) {
      const l = labelById.get(tag);
      if (l) chips.push({ key: "tag:" + tag, icon: l.icon, label: l.name });
    }
    if (state.fav) chips.push({ key: "fav", icon: "star", label: "Favorites" });
    if (state.sort !== "rel") chips.push({ key: "sort", icon: "arrow-up-down", label: state.sort === "az" ? "A–Z" : "By category" });

    els.activeChips.innerHTML = chips
      .map(
        (c) => `<span class="chip">${icon(c.icon)}<span class="chip-txt">${esc(c.label)}</span>
        <button class="chip-x" type="button" data-chip="${esc(c.key)}" aria-label="Remove filter: ${esc(c.label)}">${icon("x")}</button></span>`,
      )
      .join("");
  }

  function renderQuickFilters() {
    els.quickFilters.innerHTML = LABELS.map((l) => {
      const on = state.tags.has(l.id);
      const count = baseScored.reduce((n, x) => {
        const req = new Set(state.tags);
        req.add(l.id);
        return passesTags(x.t, req) ? n + 1 : n;
      }, 0);
      return `<button class="qf" type="button" data-tag="${esc(l.id)}" aria-pressed="${on}">
        ${icon(l.icon)}<span>${esc(l.name)}</span><span class="qf-n">${count}</span></button>`;
    }).join("");
  }

  // ---------------------------------------------------------------- sidebar
  function renderSidebar() {
    els.catTree.innerHTML = CATALOG.categories.map((c) => {
      const open = expanded.has(c.id);
      const subs = c.subcategories.length
        ? `<div class="nav-subs" ${open ? "" : "hidden"}>${c.subcategories
            .map(
              (s) =>
                `<button class="nav-sub" type="button" data-sub="${esc(s.id)}" data-cat="${esc(c.id)}">
                 <span>${esc(s.name)}</span><span class="nav-count">${s.count}</span></button>`,
            )
            .join("")}</div>`
        : "";
      return `<div class="nav-cat" data-catrow="${esc(c.id)}">
        <div class="nav-cat-row">
          <button class="nav-item" type="button" data-cat="${esc(c.id)}"
                  title="${esc(c.name)}" aria-current="false">
            <span class="nav-icon">${icon(c.icon)}</span>
            <span class="nav-label">${esc(c.name)}</span>
            <span class="nav-count">${c.count}</span>
          </button>
          ${
            c.subcategories.length
              ? `<button class="nav-expand" type="button" data-expand="${esc(c.id)}"
                    aria-expanded="${open}" aria-label="${open ? "Collapse" : "Expand"} ${esc(c.name)}">${icon("chevron-right")}</button>`
              : ""
          }
        </div>
        ${subs}
      </div>`;
    }).join("");
    els.allCount.textContent = TOOLS.length;
    updateNavActive();
  }

  function updateNavActive() {
    $$(".nav-item[data-cat]").forEach((b) => {
      const on = b.dataset.cat === state.cat;
      b.setAttribute("aria-current", on ? "true" : "false");
      b.classList.toggle("active", on);
      if (on && !state.sub) expanded.add(b.dataset.cat);
    });
    const allBtn = $(".nav-item[data-all]");
    const allOn = !state.cat && !state.fav;
    allBtn.classList.toggle("active", allOn);
    allBtn.setAttribute("aria-current", allOn ? "true" : "false");
    const favBtn = $(".nav-item[data-fav]");
    favBtn.classList.toggle("active", state.fav);
    favBtn.setAttribute("aria-current", state.fav ? "true" : "false");
    els.favCount.textContent = favs.size;

    $$(".nav-sub").forEach((b) => {
      const on = b.dataset.sub === state.sub;
      b.classList.toggle("active", on);
      if (on) {
        const row = b.closest(".nav-cat");
        if (row) {
          expanded.add(row.dataset.catrow);
          const subs = $(".nav-subs", row);
          if (subs) subs.hidden = false;
          const exp = $("[data-expand]", row);
          if (exp) exp.setAttribute("aria-expanded", "true");
        }
      }
    });
  }

  function filterSidebar() {
    const q = els.catFilter.value.trim().toLowerCase();
    $$(".nav-cat").forEach((row) => {
      if (!q) { row.hidden = false; $$(".nav-sub", row).forEach((s) => (s.hidden = false)); return; }
      const catName = (catById.get(row.dataset.catrow) || {}).name || "";
      let any = catName.toLowerCase().includes(q);
      $$(".nav-sub", row).forEach((s) => {
        const match = (subById.get(s.dataset.sub) || {}).name || "";
        const hit = match.toLowerCase().includes(q);
        s.hidden = !hit;
        if (hit) any = true;
      });
      row.hidden = !any;
    });
  }

  // ---------------------------------------------------------------- home
  function renderHome() {
    const s = CATALOG.stats;
    const subCount = CATALOG.categories.reduce((n, c) => n + c.subcategories.length, 0);
    els.stats.innerHTML = [
      [s.tools, "tools"],
      [CATALOG.categories.length, "categories"],
      [subCount, "subcategories"],
      [s.openSource, "open source"],
      [s.localOffline, "local/offline"],
      [s.freeTier, "free tiers"],
    ]
      .map(([n, label]) => `<div><dd>${n}</dd><dt>${label}</dt></div>`)
      .join("");

    els.catGrid.innerHTML = CATALOG.categories.map((c) =>
      `<button class="cat-card" type="button" data-cat="${esc(c.id)}">
        <span class="tile" aria-hidden="true">${icon(c.icon)}</span>
        <span class="cc-body">
          <span class="cc-name">${esc(c.name)}</span>
          <span class="cc-count">${c.count} tools</span>
        </span>
      </button>`,
    ).join("");

    els.homeQuick.innerHTML = LABELS.map((l) =>
      `<button class="qf" type="button" data-tag="${esc(l.id)}" aria-pressed="false">
        ${icon(l.icon)}<span>${esc(l.name)}</span><span class="qf-n">${l.count}</span></button>`,
    ).join("");

    renderRecent();
  }

  function renderRecent() {
    const items = recent.map((id) => toolById.get(id)).filter(Boolean);
    els.recentBlock.hidden = items.length === 0;
    els.recentRow.innerHTML = items
      .map(
        (t) => `<button class="qf" type="button" data-recent="${esc(t.id)}" title="${esc(t.description)}">
          ${icon(t.icon)}<span>${esc(t.name)}</span></button>`,
      )
      .join("");
  }

  function recordRecent(id) {
    recent = [id, ...recent.filter((x) => x !== id)].slice(0, 8);
    store.set("recent", recent);
    renderRecent();
  }

  // The single search form lives in the hero on the home screen and moves
  // into the top bar while browsing — one input, no duplicated controls.
  function placeSearch() {
    const home = !isActive();
    const slot = home ? els.heroSlot : els.topbarSlot;
    if (slot && els.searchForm.parentElement !== slot) slot.appendChild(els.searchForm);
    els.searchForm.classList.toggle("in-hero", home);
    document.body.dataset.view = home ? "home" : "browse";
  }

  // ---------------------------------------------------------------- apply
  function apply(opts) {
    const o = opts || {};
    if (o.resetLimit !== false) renderLimit = PAGE;

    const active = isActive();
    els.home.hidden = active;
    els.browse.hidden = !active;
    placeSearch();
    els.clearQ.hidden = !state.q;
    els.sortSel.value = state.sort;
    const relOpt = els.sortSel.querySelector('option[value="rel"]');
    relOpt.textContent = state.q ? "Best match" : "Recommended order";

    if (active) {
      baseScored = computeBase();
      const required = state.tags;
      const list = sorted(baseScored.filter((x) => passesTags(x.t, required)));
      renderResults(list);
      renderChips();
      renderQuickFilters();
      if (state.tool) {
        const idx = list.findIndex((x) => x.t.id === state.tool);
        if (idx < 0) {
          // The linked tool is hidden by the current filters — clear them so it shows.
          state.q = ""; state.cat = ""; state.sub = ""; state.fav = false;
          state.all = false; state.tags.clear();
          els.q.value = "";
          baseScored = computeBase();
          const l2 = sorted(baseScored.filter((x) => passesTags(x.t, state.tags)));
          renderResults(l2);
          renderChips();
          renderQuickFilters();
          flashTool(state.tool, Math.max(0, l2.findIndex((x) => x.t.id === state.tool)));
        } else {
          flashTool(state.tool, idx);
        }
      }
    } else {
      // Home view: clear browse controls so no stale state lingers in the DOM.
      els.activeChips.innerHTML = "";
      els.quickFilters.innerHTML = "";
      els.results.innerHTML = "";
      els.showMore.hidden = true;
    }

    updateNavActive();
    if (o.focusNav !== undefined && o.focusNav) {
      els.results.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    writeHash(o.write || "none");
  }

  function flashTool(id, index) {
    if (index + 1 > renderLimit) renderLimit = index + 1;
    let el = document.getElementById("t-" + id);
    if (!el) {
      const list = sorted(baseScored.filter((x) => passesTags(x.t, state.tags)));
      renderResults(list);
      el = document.getElementById("t-" + id);
    }
    if (!el) return;
    el.classList.add("flash");
    // Smooth scroll can be deferred in background tabs — verify and fall back.
    const smooth = !prefersReducedMotion() && document.visibilityState === "visible";
    el.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
    if (smooth) {
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: "center", behavior: "auto" });
      }, 400);
    }
    el.addEventListener("animationend", () => el.classList.remove("flash"), { once: true });
    // Safety: if animations are disabled the class would otherwise stick around.
    setTimeout(() => el.classList.remove("flash"), 2000);
  }

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------- actions
  function setQ(v, write) {
    state.q = v;
    els.q.value = v;
    clearToolParam();
    apply({ write: write || "replace" });
  }

  function goCat(catId, subId, push) {
    state.cat = catId || "";
    state.sub = subId || "";
    state.all = false;
    state.fav = false;
    clearToolParam();
    if (catId) expanded.add(catId);
    applyFiltersUI();
    apply({ write: push ? "push" : "push", focusNav: true });
    if (isMobile()) closeDrawer();
  }

  function applyFiltersUI() { /* kept for symmetry: state -> UI happens in apply() */ }

  function toggleTag(tag) {
    if (state.tags.has(tag)) state.tags.delete(tag);
    else state.tags.add(tag);
    clearToolParam();
    apply({ write: "push" });
  }

  function toggleFav(id) {
    if (favs.has(id)) favs.delete(id);
    else favs.add(id);
    store.set("favs", [...favs]);
    els.favCount.textContent = favs.size;
    const t = toolById.get(id);
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => {
      const on = favs.has(id);
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-label", `${on ? "Remove" : "Add"} ${t ? t.name : "tool"} ${on ? "from" : "to"} favorites`);
      b.title = on ? "Remove from favorites" : "Add to favorites";
    });
    if (state.fav) apply({ write: "none" });
  }

  let toastTimer = 0;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (els.toast.hidden = true), 1900);
  }

  function copyLink(id) {
    const url = location.origin + location.pathname + hashString().replace(/(^#|&tool=[^&]*)/g, "") +
      (hashString().length > 1 ? "&" : "#") + "tool=" + encodeURIComponent(id);
    const done = () => toast("Link copied to clipboard");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
    } else fallbackCopy(url, done);
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); }
    catch (e) { toast("Could not copy — select the address bar instead"); }
    document.body.removeChild(ta);
  }

  function openRandom() {
    const t = TOOLS[Math.floor(Math.random() * TOOLS.length)];
    resetState();
    state.tool = t.id;
    apply({ write: "push" });
    toast("Random pick: " + t.name);
  }

  // ---------------------------------------------------------------- drawer
  function openDrawer() {
    els.sidebar.classList.add("open");
    els.backdrop.hidden = false;
    els.navToggle.setAttribute("aria-expanded", "true");
  }
  function closeDrawer() {
    els.sidebar.classList.remove("open");
    els.backdrop.hidden = true;
    els.navToggle.setAttribute("aria-expanded", "false");
  }

  // ---------------------------------------------------------------- theme
  function setTheme(theme, save) {
    document.documentElement.dataset.theme = theme;
    const light = theme === "light";
    els.themeBtn.innerHTML = icon(light ? "moon" : "sun");
    els.themeBtn.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
    els.themeBtn.title = light ? "Switch to dark theme" : "Switch to light theme";
    if (save) store.set("theme", theme);
  }

  // ---------------------------------------------------------------- events
  function wireEvents() {
    // static icons
    els.navToggle.innerHTML = icon("menu");
    els.navClose.innerHTML = icon("x");
    els.randomBtn.innerHTML = icon("shuffle");
    $("#repoBtn").innerHTML = icon("git-fork");
    $(".search-icon").innerHTML = icon("search");
    $(".empty-icon").innerHTML = icon("circle-help");
    els.clearQ.innerHTML = icon("x");
    $$("[data-icon]").forEach((el) => (el.innerHTML = icon(el.dataset.icon)));

    els.q.addEventListener("input", () => setQ(els.q.value, "replace"));
    els.searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      els.q.blur();
    });
    els.clearQ.addEventListener("click", () => { setQ("", "replace"); els.q.focus(); });

    els.brandHome.addEventListener("click", (e) => { e.preventDefault(); resetState(); apply({ write: "push" }); });

    // sidebar (delegated)
    $("#catNav").addEventListener("click", (e) => {
      const expand = e.target.closest("[data-expand]");
      if (expand) {
        const id = expand.dataset.expand;
        const open = expanded.has(id);
        if (open) expanded.delete(id); else expanded.add(id);
        expand.setAttribute("aria-expanded", String(!open));
        const row = expand.closest(".nav-cat");
        const subs = row && $(".nav-subs", row);
        if (subs) subs.hidden = open;
        return;
      }
      const sub = e.target.closest("[data-sub]");
      if (sub) { goCat(sub.dataset.cat, sub.dataset.sub); return; }
      const cat = e.target.closest("[data-cat]");
      if (cat) { goCat(cat.dataset.cat, ""); return; }
      if (e.target.closest("[data-all]")) {
        resetState(); state.all = true;
        apply({ write: "push", focusNav: true });
        if (isMobile()) closeDrawer();
        return;
      }
      if (e.target.closest("[data-fav]")) {
        resetState(); state.fav = true;
        apply({ write: "push", focusNav: true });
        if (isMobile()) closeDrawer();
      }
    });
    els.catFilter.addEventListener("input", filterSidebar);

    // home (delegated)
    els.catGrid.addEventListener("click", (e) => {
      const c = e.target.closest("[data-cat]");
      if (c) goCat(c.dataset.cat, "");
    });
    const tagHandler = (e) => {
      const b = e.target.closest("[data-tag]");
      if (!b) return;
      state.all = state.all || false;
      clearToolParam();
      toggleTag(b.dataset.tag);
    };
    els.homeQuick.addEventListener("click", tagHandler);
    els.quickFilters.addEventListener("click", tagHandler);
    els.recentRow.addEventListener("click", (e) => {
      const b = e.target.closest("[data-recent]");
      if (!b) return;
      resetState();
      state.tool = b.dataset.recent;
      apply({ write: "push" });
    });
    els.clearRecent.addEventListener("click", () => {
      recent = [];
      store.set("recent", recent);
      renderRecent();
    });

    // chips
    els.activeChips.addEventListener("click", (e) => {
      const b = e.target.closest("[data-chip]");
      if (!b) return;
      const key = b.dataset.chip;
      if (key === "q") setQ("", "push");
      else if (key === "all") { state.all = false; apply({ write: "push" }); }
      else if (key === "cat") { state.cat = ""; state.sub = ""; apply({ write: "push" }); }
      else if (key === "sub") { state.sub = ""; apply({ write: "push" }); }
      else if (key === "fav") { state.fav = false; apply({ write: "push" }); }
      else if (key === "sort") { state.sort = "rel"; apply({ write: "push" }); }
      else if (key.startsWith("tag:")) { state.tags.delete(key.slice(4)); apply({ write: "push" }); }
    });

    // results (delegated)
    els.results.addEventListener("click", (e) => {
      const crumb = e.target.closest("[data-crumb]");
      if (crumb) {
        if (crumb.dataset.crumb === "cat") goCat(crumb.dataset.id, "");
        else goCat(crumb.dataset.cat, crumb.dataset.id);
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
        return;
      }
      const fav = e.target.closest("[data-fav]");
      if (fav) { toggleFav(fav.dataset.fav); return; }
      const copy = e.target.closest("[data-copy]");
      if (copy) { copyLink(copy.dataset.copy); return; }
      const open = e.target.closest("[data-open]");
      if (open) recordRecent(open.dataset.open);
      // plain link navigation continues normally
    });

    els.didYouMean.addEventListener("click", (e) => {
      const b = e.target.closest("[data-dym]");
      if (b) setQ(b.dataset.dym, "push");
    });

    els.emptyClear.addEventListener("click", () => setQ("", "replace"));
    els.emptyReset.addEventListener("click", () => { resetState(); apply({ write: "push" }); });
    els.clearAll.addEventListener("click", () => { resetState(); apply({ write: "push" }); });
    els.sortSel.addEventListener("change", () => {
      state.sort = els.sortSel.value;
      apply({ write: "push" });
    });
    els.showMore.addEventListener("click", () => {
      renderLimit += PAGE;
      apply({ write: "none", resetLimit: false });
    });

    // drawer
    els.navToggle.addEventListener("click", () =>
      els.sidebar.classList.contains("open") ? closeDrawer() : openDrawer());
    els.navClose.addEventListener("click", closeDrawer);
    els.backdrop.addEventListener("click", closeDrawer);

    // theme & random
    els.themeBtn.addEventListener("click", () =>
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true));
    els.randomBtn.addEventListener("click", openRandom);

    // keyboard
    document.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toUpperCase();
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        els.q.focus();
        els.q.select();
        return;
      }
      if (e.key === "/" && !inField) {
        e.preventDefault();
        els.q.focus();
        return;
      }
      if (e.key === "Escape") {
        if (els.sidebar.classList.contains("open")) { closeDrawer(); return; }
        if (document.activeElement === els.q) {
          if (els.q.value) setQ("", "replace");
          else els.q.blur();
        }
        return;
      }
      if (e.key === "ArrowDown" && document.activeElement === els.q) {
        const first = $(".card-name", els.results);
        if (first) { e.preventDefault(); first.focus(); }
      }
    });

    // history
    window.addEventListener("popstate", () => { readHash(); els.q.value = state.q; apply({ write: "none" }); });
    window.addEventListener("hashchange", () => { readHash(); els.q.value = state.q; apply({ write: "none" }); });
  }

  // ---------------------------------------------------------------- boot
  function boot(catalog) {
    CATALOG = catalog;
    TOOLS = catalog.tools;
    LABELS = catalog.labels;

    for (const c of catalog.categories) {
      catById.set(c.id, c);
      for (const s of c.subcategories) subById.set(s.id, { ...s, catId: c.id });
    }
    for (const l of LABELS) labelById.set(l.id, l);

    const catName = (id) => (catById.get(id) || {}).name || "";
    const subName = (id) => (subById.get(id) || {}).name || "";
    for (const t of TOOLS) {
      toolById.set(t.id, t);
      t.nameL = t.name.toLowerCase();
      t.nw = words(t.name);
      t.catName = catName(t.catId);
      t.subName = subName(t.subId);
      t.sw = words(t.catName + " " + t.subName);
      t.subW = words(t.subName);
      const tagNames = t.tags.map((x) => (labelById.get(x) || {}).name || "");
      t.restL = (t.description + " " + t.catName + " " + t.subName + " " + tagNames.join(" ") + " " + t.notes.join(" ")).toLowerCase();
      t.rw = words(t.restL);
    }

    const savedTheme = store.get("theme", null);
    // Optional ?theme=light|dark override (handy for sharing a specific theme).
    const themeParam = new URLSearchParams(location.search).get("theme");
    const wantTheme = themeParam === "light" || themeParam === "dark" ? themeParam : savedTheme;
    setTheme(wantTheme === "light" ? "light" : "dark", !!themeParam);

    wireEvents();
    renderSidebar();
    renderHome();

    readHash();
    els.q.value = state.q;
    if (state.cat) expanded.add(state.cat);
    applyFiltersUI();
    apply({ write: "replace" });
    filterSidebar();
  }

  function bootError() {
    document.getElementById("home").innerHTML =
      `<div class="empty" style="max-width:640px;margin:40px auto">
         <span class="empty-icon">${icon("circle-help")}</span>
         <h2>The catalog could not be loaded</h2>
         <p>This page needs <code>data/catalog.json</code>. If you cloned the repository,
            run <code>node scripts/build.mjs</code> first, or read the full directory on GitHub.</p>
         <div class="empty-actions">
           <a class="btn" href="https://github.com/kritagyadubey/awesome-tools#readme">Open the README</a>
         </div>
       </div>`;
  }

  fetch("data/catalog.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(boot)
    .catch(bootError);
})();
