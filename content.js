// Prism — overlay host (runs in the top frame only, injected on click)
(() => {
  if (window.__zmvLoaded) return;
  window.__zmvLoaded = true;

  const EXT_ORIGIN = new URL(chrome.runtime.getURL("")).origin;
  let host = null;
  let frame = null;
  let backdrop = null;
  let saved = null;
  let tabRef = null;

  const CSS = `
    :host { all: initial; }
    .wrap { position: fixed; inset: 0; }
    .bd, iframe { animation: zin .35s cubic-bezier(.2,.8,.2,1) both; }
    .wrap.out .bd, .wrap.out iframe { animation: zout .25s ease-in both; }
    .bd { position: absolute; inset: 0; transition: background .4s ease, backdrop-filter .4s ease; }
    .bd.glass.dark  { background: rgba(9, 8, 20, .52); backdrop-filter: blur(16px) saturate(1.25); }
    .bd.glass.light { background: rgba(240, 238, 252, .5); backdrop-filter: blur(16px) saturate(1.3); }
    .bd.clear.dark  { background: rgba(6, 6, 14, .18); }
    .bd.clear.light { background: rgba(255, 255, 255, .12); }
    .bd.aurora, .bd.studio, .bd.mesh { background: transparent; }
    iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; color-scheme: normal; }
    @keyframes zin { from { opacity: 0; } to { opacity: 1; } }
    @keyframes zout { to { opacity: 0; } }
  `;

  function open(tabId, windowId) {
    tabRef = { tabId, windowId };
    host = document.createElement("prism-preview");
    host.style.cssText =
      "all:initial !important;position:fixed !important;inset:0 !important;z-index:2147483647 !important;display:block !important;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style><div class="wrap"><div class="bd glass dark"></div><iframe allow="display-capture; clipboard-write; fullscreen; autoplay" title="Prism"></iframe></div>`;
    backdrop = root.querySelector(".bd");
    frame = root.querySelector("iframe");
    const q = new URLSearchParams({ tab: tabId, win: windowId, url: location.href });
    frame.src = chrome.runtime.getURL("stage/stage.html") + "?" + q.toString();
    frame.addEventListener("load", () => frame.focus());
    (document.body || document.documentElement).appendChild(host);

    const de = document.documentElement;
    saved = { overflow: de.style.getPropertyValue("overflow"), prio: de.style.getPropertyPriority("overflow") };
    de.style.setProperty("overflow", "hidden", "important");
  }

  function close() {
    if (!host) return;
    const h = host;
    backdrop.parentElement.classList.add("out");
    setTimeout(() => h.remove(), 240);
    host = frame = backdrop = null;
    const de = document.documentElement;
    if (saved) de.style.setProperty("overflow", saved.overflow, saved.prio);
    saved = null;
    chrome.runtime.sendMessage({ type: "zmv:closed", tabId: tabRef && tabRef.tabId }).catch(() => {});
  }

  window.__zmvIsOpen = () => !!host;
  window.__zmvToggle = (tabId, windowId) => (host ? close() : open(tabId, windowId));

  window.addEventListener("message", (e) => {
    if (!host || !frame || e.source !== frame.contentWindow || e.origin !== EXT_ORIGIN) return;
    const d = e.data || {};
    if (!d.__zmvStage) return;
    if (d.type === "close") close();
    if (d.type === "backdrop") backdrop.className = `bd ${d.mode} ${d.theme}`;
  });

  window.addEventListener("pagehide", () => {
    if (host) chrome.runtime.sendMessage({ type: "zmv:closed", tabId: tabRef && tabRef.tabId }).catch(() => {});
  });
})();
