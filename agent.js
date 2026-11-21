// Prism — preview-frame agent (isolated world).
// Reports scroll + navigation to the stage and applies touch cursor / scrollbar
// styling. Exits immediately on every normal page.
(() => {
  if (window.top === window) return;
  let name;
  try { name = window.name; } catch (_) { return; }
  if (!name || name.indexOf("__zmv|") !== 0) return;

  const slot = name.split("|")[1];
  const kind = name.split("|")[2];
  const STAGE = new URL(chrome.runtime.getURL("")).origin;
  const KEY = "__zmv_interact";
  let cfg = { touch: true, hideScrollbars: true };
  let suppressUntil = 0;
  let lastHref = "";
  let styleEl = null;

  const post = (m) => {
    try { window.parent.postMessage(Object.assign({ __zmvAgent: 1, slot }, m), STAGE); } catch (_) {}
  };
  const se = () => document.scrollingElement || document.documentElement;

  const markInteract = () => {
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch (_) {}
  };
  const userInitiated = () => {
    try { return Date.now() - Number(sessionStorage.getItem(KEY) || 0) < 5000; } catch (_) { return false; }
  };

  const TOUCH_CURSOR =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34"><circle cx="17" cy="17" r="13" fill="rgba(124,92,255,0.28)" stroke="rgba(255,255,255,0.9)" stroke-width="2"/><circle cx="17" cy="17" r="3" fill="white"/></svg>'
    );

  function applyCfg() {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "__zmv_style";
    }
    const mobile = kind === "phone" || kind === "tablet";
    let css = "";
    if (cfg.touch && mobile) css += `html, html * { cursor: url("${TOUCH_CURSOR}") 17 17, auto !important; }`;
    if (cfg.hideScrollbars && mobile) css += `html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; } html { scrollbar-width: none !important; }`;
    styleEl.textContent = css;
    if (!styleEl.isConnected) (document.head || document.documentElement).appendChild(styleEl);
  }

  function report() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    post({ type: "nav", href: location.href, title: document.title, user: userInitiated() });
  }

  let ticking = false;
  window.addEventListener(
    "scroll",
    (e) => {
      if (e.target !== document && e.target !== document.documentElement) return;
      if (performance.now() < suppressUntil || ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const s = se();
        const maxY = s.scrollHeight - window.innerHeight;
        const maxX = s.scrollWidth - window.innerWidth;
        post({ type: "scroll", y: maxY > 0 ? s.scrollTop / maxY : 0, x: maxX > 0 ? s.scrollLeft / maxX : 0 });
      });
    },
    { passive: true, capture: true }
  );

  window.addEventListener("pointerdown", markInteract, true);
  window.addEventListener("keydown", markInteract, true);
  window.addEventListener("pointerdown", () => post({ type: "focus" }), true);

  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || e.origin !== STAGE) return;
    const d = e.data || {};
    if (!d.__zmvStage) return;
    if (d.type === "scrollTo") {
      suppressUntil = performance.now() + 160;
      const s = se();
      const maxY = s.scrollHeight - window.innerHeight;
      const maxX = s.scrollWidth - window.innerWidth;
      s.scrollTo({ top: Math.round(d.y * maxY), left: Math.round(d.x * maxX), behavior: "instant" });
    } else if (d.type === "cfg") {
      cfg = Object.assign(cfg, d.cfg || {});
      applyCfg();
    } else if (d.type === "back") {
      markInteract();
      history.back();
    } else if (d.type === "forward") {
      markInteract();
      history.forward();
    } else if (d.type === "hello") {
      lastHref = "";
      report();
    }
  });

  const boot = () => {
    applyCfg();
    report();
    post({ type: "ready", href: location.href, title: document.title });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  // SPA route changes (pushState) can't be hooked from the isolated world: poll lightly.
  setInterval(report, 600);
  window.addEventListener("popstate", report);
})();
