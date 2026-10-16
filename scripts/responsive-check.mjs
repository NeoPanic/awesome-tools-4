// Responsive layout checker: drives headless Edge over CDP with exact device
// metrics, measures horizontal overflow + layout state, and captures screenshots.
// Usage: node scripts/responsive-check.mjs   (site must be served locally, see serve.mjs)
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const EDGE = process.env.EDGE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = process.env.BASE || "http://localhost:8788/";
const PORT = Number(process.env.CDP_PORT || 9444);
const SHOTS = process.env.SHOTS || join(process.env.TEMP || ".", "at-responsive-shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(SHOTS, { recursive: true });

const child = spawn(
  EDGE,
  [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(process.env.TEMP || ".", "at-cdp-" + Date.now())}`,
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);

async function getJson(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error("timeout: " + url);
}

try {
  const targets = await getJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");

  const PROBE = `(() => {
    const vw = window.innerWidth, de = document.documentElement;
    const bad = [...document.querySelectorAll('body *')].filter((e) => {
      const cs = getComputedStyle(e);
      if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right > vw + 1 || r.left < -1);
    }).slice(0, 10).map((e) => {
      const r = e.getBoundingClientRect();
      let sel = e.tagName.toLowerCase();
      if (e.id) sel += '#' + e.id;
      if (typeof e.className === 'string' && e.className) sel += '.' + e.className.trim().split(/\\s+/).join('.');
      return sel.slice(0, 72) + ' [l=' + Math.round(r.left) + ' r=' + Math.round(r.right) + ' w=' + Math.round(r.width) + ']';
    });
    const bn = document.querySelector('.brand-name');
    return {
      vw, scrollW: de.scrollWidth,
      overflowX: de.scrollWidth > vw,
      brandNameShown: !!bn && getComputedStyle(bn).display !== 'none',
      menuShown: getComputedStyle(document.getElementById('navToggle')).display !== 'none',
      topbarAreas: getComputedStyle(document.querySelector('.topbar')).gridTemplateAreas.replace(/\\s+/g, ' ').trim(),
      cards: document.querySelectorAll('.card').length,
      catCards: document.querySelectorAll('.cat-card').length,
      theme: document.documentElement.dataset.theme,
      bad,
    };
  })()`;

  async function run(label, width, height, url, opts = {}) {
    await send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: opts.dpr || 1, mobile: !!opts.mobile,
    });
    await send("Page.navigate", { url });
    await sleep(2600);
    const ev = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
    console.log("== " + label + " (" + width + "x" + height + ")");
    console.log(JSON.stringify(ev.result.value, null, 1));
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const file = join(SHOTS, label + ".png");
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log("  shot: " + file);
  }

  await run("mobile-dark-home", 390, 844, BASE + "?v=m1", { mobile: true, dpr: 2 });
  await run("mobile-light-browse", 390, 844, BASE + "?v=m2&theme=light#q=pdf", { mobile: true, dpr: 2 });
  await run("tablet-light-home", 768, 1024, BASE + "?v=m3&theme=light");
  await run("desktop-dark-browse", 1440, 900, BASE + "?v=m4#all=1");
} finally {
  try { child.kill(); } catch { /* already gone */ }
}
