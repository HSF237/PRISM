/* Prism — stage
   Runs inside the extension iframe that covers the page. Renders the toolbar,
   device frames (each holding a live iframe of the page) and the panels. */
(() => {
  "use strict";

  // ───────────────────────── constants & helpers ─────────────────────────
  const P = new URLSearchParams(location.search);
  const TAB = Number(P.get("tab")) || 0;
  const WIN = Number(P.get("win")) || undefined;
  const EMBEDDED = window.parent !== window;
  let startUrl = P.get("url") || "https://example.com/";

  const DEVICES = window.ZMV_DEVICES;
  const BY_ID = Object.fromEntries(DEVICES.map((d) => [d.id, d]));
  const CATS = window.ZMV_CATS;
  const FINISHES = window.ZMV_FINISHES;
  const SLOT_COLORS = ["#8b5cf6", "#10b981", "#f97316", "#0ea5e9"];
  const MAX_SLOTS = 4;
  const GAP = 56;
  const PAD_X = 48;
  const DUO_GAP = 30;          // hinge band hidden in the middle of a spanned Duo
  const EASE = "cubic-bezier(.2,.9,.2,1)";
  const ico = window.ico;

  const HEADER_UA = {
    "ios-phone": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
    "ios-tablet": "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
    "android-phone": "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
    "android-tablet": "Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.runtime && chrome.runtime.id;

  const DEFAULTS = {
    slots: [
      { deviceId: "mba13", landscape: false },
      { deviceId: "px9p", landscape: false },
      { deviceId: "ip17pm", landscape: false }
    ],
    active: 2,
    zoom: "fit",
    spotlight: false,
    minimized: false,
    settings: {
      theme: "dark",
      backdrop: "glass",
      finish: "midnight",
      syncScroll: true,
      syncNav: true,
      browserUI: false,
      mobileUA: true,
      touch: true,
      hideScrollbars: true,
      gloss: true,
      labels: true,
      shotStyle: "screen"
    }
  };

  let uidSeq = 0;
  const state = structuredClone(DEFAULTS);
  const ui = { panelSlot: 0, openPop: null, rec: null, headerUA: undefined };

  // ───────────────────────── persistence ─────────────────────────
  async function load() {
    if (!hasChrome) return;
    try {
      const { zmvState } = await chrome.storage.local.get("zmvState");
      if (zmvState) {
        Object.assign(state, zmvState, { settings: Object.assign({}, DEFAULTS.settings, zmvState.settings || {}) });
        if (!Array.isArray(state.slots) || !state.slots.length) state.slots = structuredClone(DEFAULTS.slots);
        state.slots = state.slots.slice(0, MAX_SLOTS);
      }
    } catch (_) {}
  }
  let saveT = 0;
  function save() {
    if (!hasChrome) return;
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const out = {
        slots: state.slots.map((s) => ({ deviceId: s.deviceId, landscape: !!s.landscape, custom: s.custom || null, folded: s.folded })),
        active: state.active,
        zoom: state.zoom,
        spotlight: state.spotlight,
        minimized: state.minimized,
        settings: state.settings
      };
      chrome.storage.local.set({ zmvState: out }).catch(() => {});
    }, 250);
  }

  // ───────────────────────── device geometry ─────────────────────────
  function getDev(slot) {
    if (slot.deviceId === "custom" && slot.custom) {
      const { w, h } = slot.custom;
      const kind = w <= 600 ? "phone" : w <= 1100 ? "tablet" : "desktop";
      return {
        id: "custom", cat: "Custom", name: "Custom", w, h, kind, os: "android",
        style: kind === "phone" ? "generic" : kind === "tablet" ? "tablet" : "monitor"
      };
    }
    const d = BY_ID[slot.deviceId] || BY_ID.ip17pm;
    if (d.foldable && slot.folded === false && d.inner) {
      const I = d.inner;
      return Object.assign({}, d, { w: I.w, h: I.h, mm: I.mm, res: I.res, ppi: I.ppi, sr: I.sr, style: d.duo ? "duo-open" : "fold-open", open: true, cover: d });
    }
    return d;
  }

  // True scale: CSS px per mm comes from the real screen (resolution ÷ ppi),
  // and the body is drawn around it from the manufacturer's dimensions.
  function physical(d) {
    if (!d.mm || !d.res || !d.ppi) return null;
    const k = d.w / ((d.res[0] / d.ppi) * 25.4);
    return { k, fw: d.mm[0] * k, fh: d.mm[1] * k };
  }

  function geom(d, land, slot) {
    const st = state.settings;
    const rot = land && d.kind !== "desktop";
    const vw = rot ? d.h : d.w;
    const vh = rot ? d.w : d.h;
    let pad = { t: 0, r: 0, b: 0, l: 0 }, radius = 0, sradius = 0, extraH = 0, baseW = 0;
    let sb = 0, bt = 0, bb = 0;

    // iPhone Duo — Apple specs: open 164.6 × 117.8 mm, closed 84.1 × 117.8 mm,
    // outer 5.4" 1398×2034 @460ppi (466×678 at 3x), inner 7.6" 2670×1878 @430ppi (890×626 at 3x).
    if (d.style === "duo-cover") {
      // shown flat from the outside, like Apple's product shot: back panel + live cover display
      const FW = 995, half = 497, FH = d.h + 34;
      pad = { t: 17, b: 17, l: half + 12, r: FW - (half + 12) - d.w };
      sb = 44;
      if (st.browserUI) bb = 82;
      return { vw: d.w, vh: d.h, pad, radius: 60, sradius: 42, fw: FW, fh: FH, tw: FW, th: FH, sb, bt, bb, baseW: 0, rot: false, half };
    }
    if (d.style === "duo-open") {
      const b = 20;
      pad = { t: b, r: b, b: b, l: b };
      sb = 32;
      if (st.browserUI) bt = 50;
      const fw = d.w + b * 2, fh = d.h + b * 2;
      return { vw: d.w, vh: d.h, pad, radius: 50, sradius: 32, fw, fh, tw: fw, th: fh, sb, bt, bb, baseW: 0, rot: false };
    }
    if (d.style === "fold-open") {
      const ios = d.os === "ios", P = physical(d);
      const side = P ? Math.max(6, Math.round((P.fw - d.w) / 2)) : 11, cap = P ? Math.max(6, Math.round((P.fh - d.h) / 2)) : 11;
      const b = Math.round((side + cap) / 2);
      pad = { t: cap, r: side, b: cap, l: side };
      sb = ios ? 46 : 34;
      if (st.browserUI) { if (ios) bb = 82; else bt = 58; }
      const fw = d.w + side * 2, fh = d.h + cap * 2;
      const sr = d.sr != null ? d.sr : ios ? 41 : 20;
      return { vw: d.w, vh: d.h, pad, radius: sr + b, sradius: sr, fw, fh, tw: fw, th: fh, sb, bt, bb, baseW: 0, rot: false, book: true };
    }

    const P = physical(d);
    if (P && d.kind !== "desktop") {
      // phones & tablets at true scale
      const side = Math.max(4, Math.round((P.fw - d.w) / 2));
      const cap = Math.max(4, Math.round((P.fh - d.h) / 2));
      pad = rot ? { t: side, b: side, l: cap, r: cap } : { t: cap, b: cap, l: side, r: side };
      sradius = d.sr != null ? d.sr : 30;
      radius = d.style === "home" ? Math.round((d.rb || 9) * P.k) : Math.round(sradius + (side + cap) / 2 + 2);
      if (d.kind === "phone") {
        if (!rot) {
          sb = d.os === "ios" ? (d.style === "island" ? 56 : d.style === "notch" ? 48 : 22) : 34;
          if (st.browserUI) { if (d.os === "ios") bb = 82; else bt = 58; }
        } else if (st.browserUI) bt = 46;
      } else {
        sb = 26;
        if (st.browserUI) bt = 52;
      }
    } else if (P && d.kind === "desktop") {
      // laptops & monitors at true scale
      const side = Math.max(6, Math.round((P.fw - d.w) / 2));
      const vert = Math.max(12, Math.round(P.fh - d.h));
      if (d.style === "laptop") {
        const top = Math.round(vert * 0.55);
        pad = { t: top, r: side, b: vert - top, l: side };
        radius = Math.round(5 * P.k); sradius = Math.round(1.6 * P.k);
        extraH = Math.round(6.5 * P.k);
      } else {
        pad = { t: side, r: side, b: Math.max(side, vert - side), l: side };
        radius = Math.round(3 * P.k); sradius = 4;
        extraH = 150;
      }
      if (st.browserUI) bt = 44;
    } else if (d.kind === "phone") {
      if (d.style === "home") {
        const side = 18, cap = 96;
        pad = rot ? { t: side, b: side, l: cap, r: cap } : { t: cap, b: cap, l: side, r: side };
        radius = 64; sradius = 6;
      } else {
        const b = d.thin ? 11 : d.os === "ios" ? 14 : d.style === "generic" ? 16 : 12;
        pad = { t: b, r: b, b: b, l: b };
        if (d.os === "ios") { radius = 70; sradius = 57; }
        else if (d.square) { radius = 26; sradius = 14; }
        else { radius = 50; sradius = 39; }
      }
      if (!rot) {
        sb = d.os === "ios" ? (d.style === "island" ? 56 : d.style === "notch" ? 48 : 22) : 34;
        if (st.browserUI) { if (d.os === "ios") bb = 82; else bt = 58; }
      } else if (st.browserUI) {
        bt = 46;
      }
    } else if (d.kind === "tablet") {
      const b = d.os === "ios" ? 26 : 22;
      pad = { t: b, r: b, b: b, l: b };
      radius = 46; sradius = 22;
      sb = 26;
      if (st.browserUI) bt = 52;
    } else {
      if (d.style === "laptop") {
        pad = { t: 26, r: 16, b: 18, l: 16 };
        radius = 22; sradius = 6;
        extraH = 28;
      } else {
        pad = { t: 18, r: 18, b: 36, l: 18 };
        radius = 18; sradius = 4;
        extraH = 150;
      }
      if (st.browserUI) bt = 44;
    }
    const fw = vw + pad.l + pad.r;
    const fh = vh + pad.t + pad.b;
    if (d.style === "laptop") baseW = Math.round(fw * (d.baseK || 1.16));
    const tw = Math.max(fw, baseW);
    const th = fh + extraH;
    return { vw, vh, pad, radius, sradius, fw, fh, tw, th, sb, bt, bb, baseW, rot };
  }

  // ───────────────────────── slot DOM ─────────────────────────
  const STATUS_ICONS =
    '<svg viewBox="0 0 18 12" class="sig"><rect x="0" y="8" width="3" height="4" rx=".8"/><rect x="5" y="5.5" width="3" height="6.5" rx=".8"/><rect x="10" y="3" width="3" height="9" rx=".8"/><rect x="15" y="0" width="3" height="12" rx=".8"/></svg>' +
    '<svg viewBox="0 0 16 12" class="wifi"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0z"/><path d="M3.4 6.9a6.5 6.5 0 0 1 9.2 0l-1.4 1.4a4.5 4.5 0 0 0-6.4 0z"/><path d="M1 4.5a9.9 9.9 0 0 1 14 0l-1.4 1.4a7.9 7.9 0 0 0-11.2 0z"/></svg>' +
    '<span class="bat"><i></i></span>';

  function slotHTML() {
    return `
      <div class="dev-scale">
        <div class="frame">
          <i class="hw hw1"></i><i class="hw hw2"></i><i class="hw hw3"></i><i class="hw hw4"></i>
          <div class="slab l">
            <div class="duo-cam-island">
              <div class="duo-lens"><i></i></div>
              <div class="duo-lens"><i></i></div>
              <div class="duo-island-sensors"><span class="duo-flash"></span><span class="duo-mic"><i></i><i></i><i></i></span></div>
            </div>
            <div class="duo-logo">${ico("apple")}</div>
          </div><i class="slab r"></i>
          <div class="screen">
            <div class="sbar"><span class="time">9:41</span><span class="sb-right">${STATUS_ICONS}</span></div>
            <div class="bbar top">
              <span class="lights"><i></i><i></i><i></i></span>
              <span class="bb-nav"><button data-a="back">${ico("back")}</button><button data-a="forward">${ico("forward")}</button><button data-a="reload">${ico("refresh")}</button></span>
              <div class="bb-url">${ico("lock", "svg lk")}<span class="bb-host"></span></div>
              <span class="bb-tabs">1</span>
            </div>
            <div class="vp">
              <iframe referrerpolicy="no-referrer-when-downgrade"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-presentation allow-storage-access-by-user-activation"
                allow="fullscreen; clipboard-write; autoplay; encrypted-media; picture-in-picture"></iframe>
              <div class="loader"><span></span></div>
            </div>
            <div class="bbar bottom">
              <div class="pillbar"><span class="aa">aA</span><span class="bb-host"></span><button data-a="reload">${ico("refresh")}</button></div>
              <div class="tabbar"><button data-a="back">${ico("back")}</button><button data-a="forward">${ico("forward")}</button><span class="sp"></span><span class="sp"></span><span class="sp"></span></div>
            </div>
            <div class="island"><i></i></div>
            <div class="cam"></div>
            <div class="home-ind"></div>
            <div class="gloss"></div>
            <div class="hinge"></div>
            <div class="duo-mask"></div>
          </div>
          <div class="home-btn"></div>
        </div>
        <div class="duo-bar"><i class="kn"></i><i class="rod"></i><i class="kn"></i></div>
        <div class="flap-shade"></div>
        <div class="flap">
          <div class="flap-face front"><i class="fs"></i></div>
          <div class="flap-face back">
            <div class="duo-cam-island">
              <div class="duo-lens"><i></i></div>
              <div class="duo-lens"><i></i></div>
              <div class="duo-island-sensors"><span class="duo-flash"></span><span class="duo-mic"><i></i><i></i><i></i></span></div>
            </div>
            <div class="duo-logo">${ico("apple")}</div>
            <i class="cover-screen"><i class="cover-cam"></i></i>
          </div>
        </div>
        <div class="base"><i></i></div>
        <div class="stand"><i class="neck"></i><i class="foot"></i></div>
      </div>
      <div class="label">
        <span class="num"></span>
        <button class="lname" data-a="pick"></button>
        <span class="ldims"></span>
        <span class="lacts">
          <button data-a="fold" title="Fold / Unfold (G)">${ico("fold")}</button>
          <button data-a="rotate" title="Rotate">${ico("rotate")}</button>
          <button data-a="reload" title="Reload">${ico("refresh")}</button>
          <button data-a="shot" title="Screenshot">${ico("camera")}</button>
          <button data-a="remove" title="Remove">${ico("x")}</button>
        </span>
      </div>`;
  }

  function frameName(slot) {
    const d = getDev(slot);
    return `__zmv|${slot.uid}|${d.kind}|${d.os}`;
  }

  function createSlotEl(slot, idx, animate = true) {
    slot.uid = slot.uid || ++uidSeq;
    const el = document.createElement("div");
    el.className = "dev" + (animate ? " enter" : "");
    el.innerHTML = slotHTML();
    el.style.animationDelay = animate ? `${idx * 80}ms` : "0ms";
    el.addEventListener("animationend", (e) => {
      if (e.target === el) el.classList.remove("enter", "swap");
    });
    slot.el = el;
    slot.iframe = $("iframe", el);
    slot.iframe.name = frameName(slot);
    slot.kindKey = slot.iframe.name;
    slot.iframe.addEventListener("load", () => el.classList.remove("loading"));
    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".lacts")) return;
      setActive(state.slots.indexOf(slot));
    });
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-a]");
      if (!b) return;
      e.stopPropagation();
      slotAction(slot, b.dataset.a, e);
    });
    $("#row").appendChild(el);
    navigate(slot, slot.href || startUrl, true);
    applySlot(slot);
    return el;
  }

  function slotAction(slot, a, e) {
    const i = state.slots.indexOf(slot);
    if (a === "fold") foldToggle(i);
    else if (a === "rotate") rotate(i);
    else if (a === "reload") reloadSlot(slot);
    else if (a === "shot") screenshot(slot);
    else if (a === "remove") removeSlot(i);
    else if (a === "pick") openDevPanel(i);
    else if (a === "back") postTo(slot, { type: "back" });
    else if (a === "forward") postTo(slot, { type: "forward" });
  }

  function applySlot(slot) {
    const i = state.slots.indexOf(slot);
    const d = getDev(slot);
    const g = geom(d, slot.landscape, slot);
    slot.g = g;
    const el = slot.el;
    const c = SLOT_COLORS[i] || SLOT_COLORS[0];
    const vars = {
      "--slot": c, "--vw": g.vw + "px", "--vh": g.vh + "px",
      "--pt": g.pad.t + "px", "--pr": g.pad.r + "px", "--pb": g.pad.b + "px", "--pl": g.pad.l + "px",
      "--r": g.radius + "px", "--sr": g.sradius + "px",
      "--fw": g.fw + "px", "--fh": g.fh + "px", "--tw": g.tw + "px", "--th": g.th + "px",
      "--sb": g.sb + "px", "--bt": g.bt + "px", "--bb": g.bb + "px", "--basew": g.baseW + "px"
    };
    if (g.half) {
      vars["--half"] = g.half + "px";
      vars["--gap"] = g.gap + "px";
    }
    for (const k in vars) el.style.setProperty(k, vars[k]);
    const baseDev = BY_ID[slot.deviceId] || {};
    el.className = el.className
      .split(" ")
      .filter((x) => x && !/^(k-|st-|os-|has-|land$|thin$|sq$|unfolded$|foldable$|book$|duo$)/.test(x))
      .concat([`k-${d.kind}`, `st-${d.style}`, `os-${d.os}`])
      .concat(g.rot ? ["land"] : [])
      .concat(d.thin ? ["thin"] : [])
      .concat(d.square ? ["sq"] : [])
      .concat(g.bt ? ["has-bt"] : [])
      .concat(g.bb ? ["has-bb"] : [])
      .concat(baseDev.foldable ? ["foldable"] : [])
      .concat(baseDev.foldable && slot.folded === false ? ["unfolded"] : [])
      .concat(g.book ? ["book"] : [])
      .concat(baseDev.duo ? ["duo"] : [])
      .join(" ");
    $(".num", el).textContent = i + 1;
    $(".lname", el).textContent = d.open ? `${d.name} · ${d.duo ? "Open" : "Unfolded"}` : d.name;
    $(".ldims", el).textContent = `${g.vw} × ${g.vh}`;
    $('[data-a="fold"]', el).hidden = !baseDev.foldable;
    $('[data-a="rotate"]', el).hidden = d.kind === "desktop";
    $('[data-a="remove"]', el).hidden = state.slots.length < 2;

    // A different device class needs a reload so the frame agent re-emulates.
    const name = frameName(slot);
    if (name !== slot.kindKey) {
      slot.kindKey = name;
      slot.iframe.name = name;
      reloadSlot(slot);
    }
    updateHost(slot);
    tickClock();
  }

  function updateHost(slot) {
    let host = "";
    try { host = new URL(slot.href).host; } catch (_) { host = slot.href || ""; }
    $$(".bb-host", slot.el).forEach((n) => (n.textContent = host));
  }

  // ───────────────────────── navigation & messaging ─────────────────────────
  function navigate(slot, href, initial) {
    slot.href = href;
    slot.lastSync = { href, t: Date.now() };
    slot.el.classList.add("loading");
    slot.iframe.src = href;
    if (!initial) updateHost(slot);
  }
  function reloadSlot(slot) {
    slot.el.classList.add("loading");
    const src = slot.href || startUrl;
    slot.iframe.src = "about:blank";
    setTimeout(() => (slot.iframe.src = src), 30);
  }
  function reloadAll() { state.slots.forEach(reloadSlot); }

  function postTo(slot, msg) {
    try { slot.iframe.contentWindow.postMessage(Object.assign({ __zmvStage: 1 }, msg), "*"); } catch (_) {}
  }
  function sendCfg(slot) {
    postTo(slot, { type: "cfg", cfg: { touch: state.settings.touch, hideScrollbars: state.settings.hideScrollbars } });
  }

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || !d.__zmvAgent) return;
    const slot = state.slots.find((s) => s.iframe && s.iframe.contentWindow === e.source);
    if (!slot) return;
    if (d.type === "ready") {
      sendCfg(slot);
    } else if (d.type === "scroll") {
      if (!state.settings.syncScroll) return;
      for (const o of state.slots) if (o !== slot) postTo(o, { type: "scrollTo", x: d.x, y: d.y });
    } else if (d.type === "nav") {
      slot.href = d.href;
      slot.title = d.title;
      updateHost(slot);
      if (slot === activeSlot()) setUrlField(d.href);
      if (state.settings.syncNav && d.user) {
        for (const o of state.slots) {
          if (o === slot || o.href === d.href) continue;
          if (o.lastSync && o.lastSync.href === d.href && Date.now() - o.lastSync.t < 5000) continue;
          navigate(o, d.href);
        }
      }
    } else if (d.type === "focus") {
      setActive(state.slots.indexOf(slot));
    }
  });

  // Clicking into a device iframe makes it the active one.
  window.addEventListener("blur", () =>
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a.tagName === "IFRAME") {
        const i = state.slots.findIndex((s) => s.iframe === a);
        if (i >= 0) setActive(i);
      }
    }, 0)
  );

  async function updateUA(reload) {
    let ua = null;
    if (state.settings.mobileUA && !state.slots.some((s) => getDev(s).kind === "desktop")) {
      const first = state.slots.map(getDev).find((d) => d.kind !== "desktop");
      if (first) ua = HEADER_UA[`${first.os}-${first.kind}`] || HEADER_UA["android-phone"];
    }
    if (ua === ui.headerUA) return;
    ui.headerUA = ua;
    if (hasChrome && TAB) {
      try { await chrome.runtime.sendMessage({ type: "zmv:ua", tabId: TAB, ua }); } catch (_) {}
    }
    if (reload) reloadAll();
  }

  // ───────────────────────── layout & zoom ─────────────────────────
  const stage = $("#stage");
  const row = $("#row");

  function visibleSlots() {
    return state.spotlight ? [activeSlot()] : state.slots;
  }

  function fitScale() {
    const vs = visibleSlots();
    const labelH = state.settings.labels ? 46 : 0;
    const availW = stage.clientWidth - PAD_X * 2 - GAP * (vs.length - 1);
    const availH = stage.clientHeight - 56 - labelH;
    const sumW = vs.reduce((a, s) => a + s.g.tw, 0);
    const maxH = Math.max(...vs.map((s) => s.g.th));
    return clamp(Math.min(availW / sumW, availH / maxH, state.spotlight ? 1.25 : 1), 0.08, 1.5);
  }

  function currentScale() {
    return state.zoom === "fit" ? fitScale() : state.zoom;
  }

  function layout() {
    if (!state.slots.length || !state.slots.every((x) => x.g && x.el)) return;
    const s = currentScale();
    ui.scale = s;
    document.body.classList.toggle("minimized", state.minimized);
    document.body.classList.toggle("spot", state.spotlight);
    for (const slot of state.slots) {
      const shown = !state.spotlight || slot === activeSlot();
      slot.el.classList.toggle("hidden", !shown);
      slot.el.style.setProperty("--s", s);
      slot.el.style.width = slot.g.tw * s + "px";
      slot.el.style.height = slot.g.th * s + "px";
    }
    row.style.gap = GAP + "px";
    const pct = Math.round(s * 100);
    $("#zoomPct").textContent = pct + "%";
    $("#zoomRange").value = clamp(pct, 15, 150);
    paintRange();
    $("#zoomFit").classList.toggle("on", state.zoom === "fit");
  }

  function paintRange() {
    const r = $("#zoomRange");
    const p = ((r.value - r.min) / (r.max - r.min)) * 100;
    r.style.setProperty("--p", p + "%");
  }

  function setZoom(z) {
    state.zoom = z === "fit" ? "fit" : clamp(z, 0.15, 1.5);
    layout();
    save();
  }

  new ResizeObserver(() => layout()).observe(stage);

  // ───────────────────────── active / slots ─────────────────────────
  function activeSlot() {
    return state.slots[clamp(state.active, 0, state.slots.length - 1)];
  }

  function setActive(i) {
    if (i < 0 || i >= state.slots.length) return;
    const changed = state.active !== i;
    state.active = i;
    state.slots.forEach((s, j) => s.el.classList.toggle("active", j === i));
    const slot = activeSlot();
    const d = getDev(slot);
    const ds = $("#devSelect");
    ds.style.setProperty("--c", SLOT_COLORS[i]);
    $(".ds-name", ds).textContent = d.name;
    $(".glyph-mini", ds).className = `glyph-mini gm-${d.kind}`;
    $("#dims").textContent = `${slot.g.vw} × ${slot.g.vh}`;
    $("#btnRotate").disabled = d.kind === "desktop" || !!d.open;
    const baseDev = BY_ID[slot.deviceId] || {};
    const btnFold = $("#btnFold");
    if (btnFold) {
      btnFold.style.display = baseDev.foldable ? "inline-flex" : "none";
      btnFold.classList.toggle("on", slot.folded === false);
      const open = slot.folded === false;
      btnFold.setAttribute("data-tip", baseDev.duo ? (open ? "Close Duo (G)" : "Open Duo (G)") : open ? "Fold (G)" : "Unfold (G)");
    }
    setUrlField(slot.href || startUrl);
    if (changed && state.spotlight) layout();
    if (changed) save();
  }

  function refreshAll(animateSwap) {
    state.slots.forEach((s) => {
      applySlot(s);
      if (animateSwap) bump(s.el);
    });
    $("#multiCount").textContent = state.slots.length;
    setActive(state.active);
    layout();
  }

  function bump(el) {
    el.classList.remove("swap");
    void el.offsetWidth;
    el.classList.add("swap");
  }

  // ── FLIP: measure → change layout instantly → animate every device from where it was ──
  function flipLayout(mutate, opts = {}) {
    const snap = () => new Map(state.slots.filter((s) => s.el && s.el.isConnected).map((s) => [s, s.el.getBoundingClientRect()]));
    const before = snap();
    const s0 = ui.scale || 1;
    document.body.classList.add("no-trans");
    mutate();
    layout();
    const after = snap();
    void document.body.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("no-trans")));
    const k = s0 / (ui.scale || 1);
    for (const [s, b] of after) {
      if (b.width === 0) continue;
      const a = before.get(s);
      const custom = opts.special ? opts.special(s, a, b, k) : null;
      if (custom === false) continue;
      if (custom) { s.el.animate(custom.frames, Object.assign({ duration: 650, easing: EASE }, custom.timing || {})); continue; }
      if (!a || a.width === 0) {
        s.el.animate([{ opacity: 0, transform: "translateY(36px) scale(.88)", filter: "blur(10px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], { duration: 620, easing: EASE });
        continue;
      }
      const dx = a.left + a.width / 2 - (b.left + b.width / 2);
      const dy = a.bottom - b.bottom;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(k - 1) < 0.002) continue;
      s.el.animate(
        [{ transformOrigin: "50% 100%", transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transformOrigin: "50% 100%", transform: "none" }],
        { duration: 680, easing: EASE }
      );
    }
  }

  // Device swap = card flip: old device turns away, new one turns in.
  function setDevice(i, deviceId, custom) {
    const slot = state.slots[i];
    slot.q = (slot.q || Promise.resolve()).then(async () => {
      const out = slot.el.animate(
        [{ transform: "perspective(1800px) rotateY(0deg)", filter: "brightness(1)" }, { transform: "perspective(1800px) rotateY(88deg)", filter: "brightness(.65)" }],
        { duration: 200, easing: "cubic-bezier(.55,0,.85,.35)", fill: "forwards" }
      );
      await out.finished.catch(() => {});
      flipLayout(() => {
        slot.deviceId = deviceId;
        slot.custom = custom || null;
        slot.folded = undefined;
        if (getDev(slot).kind === "desktop") slot.landscape = false;
        applySlot(slot);
        setActive(i);
      }, {
        special: (s) => s === slot ? {
          frames: [{ transform: "perspective(1800px) rotateY(-88deg)", filter: "brightness(.65)" }, { transform: "perspective(1800px) rotateY(0deg)", filter: "brightness(1)" }],
          timing: { duration: 620, easing: "cubic-bezier(.3,1.3,.5,1)" }
        } : null
      });
      out.cancel();
      updateUA(true);
      save();
    });
    return slot.q;
  }

  // Rotation: the device physically turns 90°, then settles into its new layout.
  function rotate(i = state.active) {
    const slot = state.slots[i];
    const d = getDev(slot);
    if (d.kind === "desktop") return toast("Desktops don't rotate", "rotate");
    if ((BY_ID[slot.deviceId] || {}).duo) return toast("iPhone Duo is shown as held — rotation isn't available", "rotate");
    if (d.open) return toast(`Close the ${d.cover.name} to rotate it`, "fold");
    slot.el.classList.add("turning");
    flipLayout(() => {
      slot.landscape = !slot.landscape;
      applySlot(slot);
      setActive(i);
    }, {
      special: (s, a, b) => {
        if (s !== slot || !a) return null;
        const dx = a.left + a.width / 2 - (b.left + b.width / 2);
        const dy = a.top + a.height / 2 - (b.top + b.height / 2);
        const ks = a.height / b.width;
        const r = slot.landscape ? 90 : -90;
        return {
          frames: [{ transformOrigin: "50% 50%", transform: `translate(${dx}px, ${dy}px) rotate(${r}deg) scale(${ks})` }, { transformOrigin: "50% 50%", transform: "none" }],
          timing: { duration: 760, easing: "cubic-bezier(.3,1.18,.45,1)" }
        };
      }
    });
    setTimeout(() => slot.el.classList.remove("turning"), 780);
    save();
    if (ui.openPop === "dev") renderDevPanel();
  }

  // ── Book devices (iPhone Duo, Fold, Z Fold, Pixel Fold): 3D flap opening ──
  const easeOutBack = (t) => { const c1 = 1.15, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function setFlap(slot, ang) {
    const el = slot.el, fw = slot.g.fw;
    const flap = $(".flap", el);
    flap.style.transform = `perspective(2600px) rotateY(${ang}deg)`;
    const c = Math.cos((ang * Math.PI) / 180);
    flap.style.setProperty("--fb", (0.55 + 0.45 * Math.abs(c)).toFixed(3));
    const edge = ang <= -90 ? fw / 2 : Math.min(fw, fw / 2 + (fw / 2) * c);
    $(".frame", el).style.clipPath = `inset(-80px ${Math.max(0, fw - edge - 3)}px -80px -80px)`;
    $(".flap-shade", el).style.opacity = ang <= -90 ? "0" : String(Math.max(0, 0.55 * Math.min(1, -ang / 90)));
  }

  function bookAnim(slot, a0, a1, dur, ease) {
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        setFlap(slot, a0 + (a1 - a0) * ease(p));
        if (p < 1) requestAnimationFrame(step);
        else res();
      };
      requestAnimationFrame(step);
    });
  }

  const anchorLeft = (slot, dur) => (s, a, b, k) =>
    s === slot && a
      ? { frames: [{ transformOrigin: "0 100%", transform: `translate(${a.left - b.left}px, ${a.bottom - b.bottom}px) scale(${k})` }, { transformOrigin: "0 100%", transform: "none" }], timing: { duration: dur } }
      : null;

  async function foldToggle(i = state.active) {
    const slot = state.slots[i];
    if (!slot) return;
    const base = BY_ID[slot.deviceId];
    if (!base || !base.foldable) return toast("Not a foldable device", "phone");
    if (slot.booking) return;
    slot.booking = true;
    const opening = slot.folded !== false;
    if (base.duo) {
      // iPhone Duo: turn the device over — outside (back + cover display) ↔ inner display
      try {
        const out = slot.el.animate(
          [{ transform: "perspective(2200px) rotateY(0deg)", filter: "brightness(1)" }, { transform: "perspective(2200px) rotateY(90deg)", filter: "brightness(.65)" }],
          { duration: 260, easing: "cubic-bezier(.55,0,.85,.35)", fill: "forwards" }
        );
        await out.finished.catch(() => {});
        flipLayout(() => {
          slot.folded = !opening;
          slot.landscape = false;
          applySlot(slot);
          setActive(i);
        }, {
          special: (s) => s === slot ? {
            frames: [{ transform: "perspective(2200px) rotateY(-90deg)", filter: "brightness(.65)" }, { transform: "perspective(2200px) rotateY(0deg)", filter: "brightness(1)" }],
            timing: { duration: 700, easing: "cubic-bezier(.3,1.25,.5,1)" }
          } : null
        });
        out.cancel();
      } finally {
        slot.booking = false;
        save();
        if (ui.openPop === "dev") renderDevPanel();
      }
      return;
    }
    const el = slot.el, front = $(".flap-face.front", el);
    try {
      if (opening) {
        flipLayout(() => {
          slot.folded = false;
          slot.landscape = false;
          applySlot(slot);
          setActive(i);
        }, { special: anchorLeft(slot, 900) });
        front.style.transition = "none";
        front.style.opacity = "1";
        setFlap(slot, -180);
        el.classList.add("flapping");
        void front.offsetWidth;
        front.style.transition = "";
        await bookAnim(slot, -180, 0, 920, easeOutBack);
        el.classList.add("waking");
        front.style.opacity = "0";          // the second screen switches on
        await sleep(380);
      } else {
        front.style.transition = "none";
        front.style.opacity = "0";
        setFlap(slot, 0);
        el.classList.add("flapping");
        void front.offsetWidth;
        front.style.transition = "";
        front.style.opacity = "1";          // second screen goes dark
        await sleep(200);
        await bookAnim(slot, 0, -180, 720, easeInOut);
        flipLayout(() => {
          slot.folded = true;
          applySlot(slot);
          setActive(i);
        }, { special: anchorLeft(slot, 600) });
        el.animate([{ transform: "perspective(1800px) rotateY(-70deg)", filter: "brightness(.6)" }, { transform: "none", filter: "brightness(1)" }], { duration: 520, easing: "cubic-bezier(.3,1.2,.5,1)" });
      }
    } finally {
      el.classList.remove("flapping", "waking");
      $(".frame", el).style.clipPath = "";
      $(".flap", el).style.transform = "";
      $(".flap-shade", el).style.opacity = "";
      slot.booking = false;
      save();
      if (ui.openPop === "dev") renderDevPanel();
    }
  }

  const ADD_ORDER = ["ip17p", "s24", "ipadair", "px8", "ipair", "ipmini"];
  function addSlot() {
    if (state.slots.length >= MAX_SLOTS) return toast("Up to 4 devices at once", "layers");
    const used = new Set(state.slots.map((s) => s.deviceId));
    const deviceId = ADD_ORDER.find((id) => !used.has(id)) || "ip17p";
    const slot = { deviceId, landscape: false };
    flipLayout(() => {
      state.slots.push(slot);
      createSlotEl(slot, 0, true);
      state.spotlight = false;
      $("#btnSpot").classList.remove("on");
      refreshAll(false);
      setActive(state.slots.length - 1);
    }, { special: (s) => (s === slot ? false : null) });
    updateUA(true);
    save();
    return state.slots.length - 1;
  }

  async function removeSlot(i) {
    if (state.slots.length < 2) return;
    const slot = state.slots[i];
    await slot.el.animate(
      [{ opacity: 1, transform: "none", filter: "blur(0)" }, { opacity: 0, transform: "translateY(34px) scale(.86)", filter: "blur(10px)" }],
      { duration: 260, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" }
    ).finished.catch(() => {});
    flipLayout(() => {
      const j = state.slots.indexOf(slot);
      state.slots.splice(j, 1);
      slot.el.remove();
      if (state.active >= state.slots.length) state.active = state.slots.length - 1;
      else if (state.active > j) state.active--;
      refreshAll(false);
    });
    updateUA(true);
    save();
    if (ui.openPop === "dev") {
      ui.panelSlot = clamp(ui.panelSlot, 0, state.slots.length - 1);
      renderDevPanel();
    }
  }

  // ───────────────────────── clock ─────────────────────────
  function tickClock() {
    const now = new Date();
    const h12 = now.getHours() % 12 || 12;
    const mm = String(now.getMinutes()).padStart(2, "0");
    const h24 = String(now.getHours()).padStart(2, "0");
    for (const s of state.slots) {
      if (!s.el) continue;
      const t = $(".time", s.el);
      t.textContent = getDev(s).os === "ios" ? `${h12}:${mm}` : `${h24}:${mm}`;
    }
  }
  setInterval(tickClock, 15000);

  // ───────────────────────── url bar ─────────────────────────
  const urlInput = $("#urlInput");
  function setUrlField(href) {
    if (document.activeElement === urlInput) return;
    urlInput.value = href || "";
    $(".lock").classList.toggle("insecure", !/^https:/.test(href || ""));
  }
  $("#urlForm").addEventListener("submit", (e) => {
    e.preventDefault();
    let v = urlInput.value.trim();
    if (!v) return;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = (/^localhost|^\d+\.\d+\.\d+\.\d+/.test(v) ? "http://" : "https://") + v;
    startUrl = v;
    state.slots.forEach((s) => navigate(s, v));
    urlInput.blur();
    setUrlField(v);
  });
  urlInput.addEventListener("focus", () => urlInput.select());
  $("#btnReload").addEventListener("click", () => {
    reloadAll();
    toast("Reloaded all devices", "refresh");
  });

  // ───────────────────────── popovers ─────────────────────────
  const devPanel = $("#devPanel");
  const setPanel = $("#settingsPanel");

  function placePop(pop, anchor) {
    const r = anchor.getBoundingClientRect();
    pop.hidden = false;
    const w = pop.offsetWidth;
    const left = clamp(r.left + r.width / 2 - w / 2, 12, window.innerWidth - w - 12);
    pop.style.left = left + "px";
    pop.style.top = r.bottom + 12 + "px";
    pop.style.maxHeight = window.innerHeight - r.bottom - 28 + "px";
    pop.style.setProperty("--arrow", clamp(r.left + r.width / 2 - left, 20, w - 20) + "px");
    pop.classList.remove("in");
    void pop.offsetWidth;
    pop.classList.add("in");
  }

  function closePops() {
    devPanel.hidden = true;
    setPanel.hidden = true;
    ui.openPop = null;
    $$(".toolbar .open").forEach((b) => b.classList.remove("open"));
  }

  function openDevPanel(i = state.active, anchor) {
    if (state.minimized) toggleMin(false);
    ui.panelSlot = i;
    ui.openPop = "dev";
    setPanel.hidden = true;
    renderDevPanel();
    devPanel.classList.add("fresh");
    clearTimeout(ui.freshT);
    ui.freshT = setTimeout(() => devPanel.classList.remove("fresh"), 1100);
    const a = anchor || $("#devSelect");
    $$(".toolbar .open").forEach((b) => b.classList.remove("open"));
    a.classList.add("open");
    placePop(devPanel, a);
  }

  document.addEventListener("pointerdown", (e) => {
    if (!ui.openPop) return;
    if (e.target.closest(".pop") || e.target.closest("#devSelect,#btnMulti,#btnSettings,.lname")) return;
    closePops();
  });

  // Device panel ─────────────────────
  function glyph(d) {
    const duoCls = d.duo ? " g-duo" : "";
    return `<span class="g g-${d.kind} gs-${d.style}${d.foldable ? " gf-fold" : ""}${duoCls}"><i></i></span>`;
  }

  function renderDevPanel() {
    const i = clamp(ui.panelSlot, 0, state.slots.length - 1);
    ui.panelSlot = i;
    const slot = state.slots[i];
    const d = getDev(slot);
    const color = SLOT_COLORS[i];
    const scrollEl = $(".dp-scroll", devPanel);
    const keep = scrollEl ? scrollEl.scrollTop : 0;
    const q = ($(".dp-search input", devPanel) || {}).value || "";

    const rail = state.slots
      .map((s, j) => `<button class="rail-btn ${j === i ? "on" : ""}" style="--c:${SLOT_COLORS[j]}" data-slot="${j}" title="${getDev(s).name}">${j + 1}</button>`)
      .join("");
    const add = state.slots.length < MAX_SLOTS ? `<button class="rail-add" data-add title="Add device">${ico("plus")}</button>` : "";

    const sections = CATS.map((c) => {
      const cards = DEVICES.filter((x) => x.cat === c.id)
        .map((x) => {
          const sel = slot.deviceId === x.id;
          return `<button class="card ${sel ? "sel" : ""}" data-dev="${x.id}" data-q="${(x.name + " " + x.cat).toLowerCase()}">
              ${glyph(x)}<b>${x.name}</b><small>${x.w}×${x.h}</small>${sel ? `<span class="tick">${ico("check")}</span>` : ""}
            </button>`;
        })
        .join("");
      return `<section data-cat="${c.id}"><h4>${ico(c.icon)}<span>${c.label}</span></h4><div class="cards">${cards}</div></section>`;
    }).join("");

    const g = slot.g;
    const isDesk = d.kind === "desktop";
    const baseDev = BY_ID[slot.deviceId] || {};
    const cw = slot.custom ? slot.custom.w : d.w;
    const ch = slot.custom ? slot.custom.h : d.h;

    devPanel.style.setProperty("--c", color);
    devPanel.innerHTML = `
      <div class="dp-rail">${rail}${add}</div>
      <div class="dp-main">
        <div class="dp-head">
          <span class="num">${i + 1}</span>
          <div class="dp-title"><b>Device ${i + 1}</b><small>${d.name} · ${g.vw}×${g.vh}</small></div>
          <label class="dp-search">${ico("search")}<input placeholder="Search devices" value="${q.replace(/"/g, "&quot;")}" /></label>
          ${state.slots.length > 1 ? `<button class="ib sm danger" data-remove title="Remove device">${ico("trash")}</button>` : ""}
        </div>
        <div class="dp-scroll">${sections}</div>
        <div class="dp-foot">
          <div class="seg ${isDesk ? "disabled" : ""}" role="group">
            <button data-orient="p" class="${!slot.landscape ? "on" : ""}">${ico("phone")}Portrait</button>
            <button data-orient="l" class="${slot.landscape ? "on" : ""}">${ico("phone", "svg rot")}Landscape</button>
          </div>
          ${baseDev.foldable ? `
          <div class="seg" role="group">
            <button data-fold="cover" class="${slot.folded !== false ? "on" : ""}">${ico("phone")}${baseDev.duo ? "Closed" : "Folded"}</button>
            <button data-fold="inner" class="${slot.folded === false ? "on" : ""}">${ico("fold")}${baseDev.duo ? "Open" : "Unfolded"}</button>
          </div>` : ""}
          <form class="custom" data-custom>
            <span class="cl">${ico("ruler")}Custom</span>
            <input type="number" name="w" min="240" max="3840" value="${cw}" aria-label="Width" />
            <span class="x">×</span>
            <input type="number" name="h" min="240" max="3840" value="${ch}" aria-label="Height" />
            <button class="apply">Apply</button>
          </form>
        </div>
      </div>`;
    const sc = $(".dp-scroll", devPanel);
    sc.scrollTop = keep;
    $$(".card", devPanel).forEach((c, n) => c.style.setProperty("--i", n));
    filterCards(q);
  }

  function filterCards(q) {
    q = q.trim().toLowerCase();
    $$(".card", devPanel).forEach((c) => (c.hidden = q && !c.dataset.q.includes(q)));
    $$("section", devPanel).forEach((s) => (s.hidden = !$$(".card", s).some((c) => !c.hidden)));
  }

  devPanel.addEventListener("input", (e) => {
    if (e.target.closest(".dp-search")) filterCards(e.target.value);
  });
  devPanel.addEventListener("click", (e) => {
    const t = e.target;
    const slotBtn = t.closest("[data-slot]");
    if (slotBtn) { ui.panelSlot = +slotBtn.dataset.slot; setActive(ui.panelSlot); return renderDevPanel(); }
    if (t.closest("[data-add]")) { const n = addSlot(); if (n != null) { ui.panelSlot = n; renderDevPanel(); } return; }
    if (t.closest("[data-remove]")) return removeSlot(ui.panelSlot);
    const card = t.closest("[data-dev]");
    if (card) { setDevice(ui.panelSlot, card.dataset.dev).then(renderDevPanel); return; }
    const o = t.closest("[data-orient]");
    if (o) {
      const slot = state.slots[ui.panelSlot];
      if ((o.dataset.orient === "l") !== !!slot.landscape) rotate(ui.panelSlot);
    }
    const fld = t.closest("[data-fold]");
    if (fld) {
      const slot = state.slots[ui.panelSlot];
      const wantInner = fld.dataset.fold === "inner";
      if ((slot.folded === false) !== wantInner) foldToggle(ui.panelSlot);
    }
  });
  devPanel.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const w = clamp(Math.round(+f.w.value || 0), 240, 3840);
    const h = clamp(Math.round(+f.h.value || 0), 240, 3840);
    state.slots[ui.panelSlot].landscape = false;
    setDevice(ui.panelSlot, "custom", { w, h }).then(renderDevPanel);
    toast(`Custom size ${w} × ${h}`, "ruler");
  });

  // Settings panel ─────────────────────
  const TOGGLES = [
    ["Simulation", [
      ["browserUI", "Browser UI", "Show the mobile/desktop browser bars"],
      ["mobileUA", "Mobile user agent", "Send a mobile UA (when no desktop is shown)"],
      ["touch", "Touch cursor", "Finger-style cursor on mobile devices"],
      ["hideScrollbars", "Hide scrollbars", "Like real phones & tablets"]
    ]],
    ["Behaviour", [
      ["syncScroll", "Sync scroll", "Scroll one device, all follow"],
      ["syncNav", "Sync navigation", "Click a link, all devices follow"],
      ["labels", "Device labels", "Names & sizes under each device"],
      ["gloss", "Glass reflection", "Subtle shine across screens"]
    ]]
  ];
  const BACKDROPS = [["glass", "Glass"], ["clear", "Clear"], ["aurora", "Aurora"], ["studio", "Studio"], ["mesh", "Mesh"]];

  function renderSettings() {
    const st = state.settings;
    const seg = (key, opts) =>
      `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${st[key] === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
    setPanel.innerHTML = `
      <div class="sp-head"><b>${ico("sparkle")}Settings</b><small>by Zerox Studios</small></div>
      <div class="sp-sec"><h4>Appearance</h4>
        <div class="sp-row"><span>Theme</span>${seg("theme", [["dark", "Dark"], ["light", "Light"]])}</div>
        <div class="sp-row col"><span>Backdrop</span>${seg("backdrop", BACKDROPS)}</div>
        <div class="sp-row col"><span>Frame finish</span><div class="swatches">${FINISHES.map(
          (f) => `<button class="sw ${st.finish === f.id ? "on" : ""}" data-finish="${f.id}" title="${f.label}" style="--a:${f.hi};--b:${f.rim}"></button>`
        ).join("")}<em>${(FINISHES.find((f) => f.id === st.finish) || FINISHES[0]).label}</em></div></div>
      </div>
      ${TOGGLES.map(([h, rows]) => `<div class="sp-sec"><h4>${h}</h4>${rows.map(([k, l, sub]) =>
        `<label class="sp-row tg"><span>${l}<small>${sub}</small></span><input type="checkbox" data-set="${k}" ${st[k] ? "checked" : ""}/><i class="switch"></i></label>`
      ).join("")}</div>`).join("")}
      <div class="sp-sec"><h4>Screenshots</h4>
        <div class="sp-row col"><span>Single-device shot</span>${seg("shotStyle", [["screen", "Screen only"], ["frame", "With device frame"]])}</div>
      </div>
      <div class="sp-sec keys"><h4>Shortcuts</h4>
        <div class="kgrid">
          <span><kbd>R</kbd>Rotate</span><span><kbd>G</kbd>Fold / Unfold</span>
          <span><kbd>S</kbd>Screenshot</span><span><kbd>⇧ S</kbd>Shot all</span>
          <span><kbd>Y</kbd>Sync scroll</span><span><kbd>F</kbd>Spotlight</span>
          <span><kbd>1–4</kbd>Select device</span><span><kbd>+ −</kbd>Zoom</span>
          <span><kbd>0</kbd>Fit</span><span><kbd>M</kbd>Hide toolbar</span>
          <span><kbd>T</kbd>Theme</span><span><kbd>Esc</kbd>Close</span>
        </div>
      </div>`;
  }

  setPanel.addEventListener("click", (e) => {
    const b = e.target.closest(".seg[data-seg] button");
    if (b) return setSetting(b.parentElement.dataset.seg, b.dataset.v);
    const f = e.target.closest("[data-finish]");
    if (f) return setSetting("finish", f.dataset.finish);
  });
  setPanel.addEventListener("change", (e) => {
    const k = e.target.dataset.set;
    if (k) setSetting(k, e.target.checked);
  });

  function setSetting(k, v) {
    state.settings[k] = v;
    applySettings(k);
    save();
    if (ui.openPop === "settings") {
      const top = setPanel.scrollTop;
      renderSettings();
      setPanel.scrollTop = top;
    }
  }

  function applySettings(changed) {
    const st = state.settings;
    document.documentElement.className = st.theme;
    $("#btnTheme").classList.toggle("light", st.theme === "light");
    $("#btnTheme .knob").innerHTML = ico(st.theme === "light" ? "sun" : "moon");
    document.body.className = document.body.className
      .split(" ")
      .filter((c) => c && !c.startsWith("bg-") && !["no-labels", "no-gloss", "bui"].includes(c))
      .concat([`bg-${st.backdrop}`])
      .concat(st.labels ? [] : ["no-labels"])
      .concat(st.gloss ? [] : ["no-gloss"])
      .concat(st.browserUI ? ["bui"] : [])
      .join(" ");
    const f = FINISHES.find((x) => x.id === st.finish) || FINISHES[0];
    document.documentElement.style.setProperty("--rim", f.rim);
    document.documentElement.style.setProperty("--rim-hi", f.hi);
    const night = st.finish === "blue";
    const duo = night
      ? { body: "#1f2737", hi: "#3a4560", edge: "#111725", pill: "#0e131d", logo: "#2b3448" }
      : { body: "#ebe4d6", hi: "#faf7f1", edge: "#d1c6b1", pill: "#1d2637", logo: "#dbd2c1" };
    for (const k in duo) document.documentElement.style.setProperty("--duo-" + k, duo[k]);
    $("#btnSync").classList.toggle("on", st.syncScroll);
    if (EMBEDDED) window.parent.postMessage({ __zmvStage: 1, type: "backdrop", mode: st.backdrop, theme: st.theme }, "*");

    if (!changed) return;
    if (changed === "browserUI" || changed === "labels") refreshAll(false);
    if (changed === "touch" || changed === "hideScrollbars") state.slots.forEach(sendCfg);
    if (changed === "mobileUA") updateUA(true);
    if (changed === "syncScroll") toast(st.syncScroll ? "Scroll sync on" : "Scroll sync off", "sync");
  }

  // ───────────────────────── screenshot ─────────────────────────
  // Captures the visible tab. Corner calibration marks let us map CSS pixels to
  // image pixels exactly, whatever the display scaling / page zoom / offset is.
  async function capture(prep, measure) {
    document.body.classList.add("capturing");
    const marks = ["tl", "br"].map((p) => {
      const d = document.createElement("div");
      d.className = "cal-mark " + p;
      document.body.appendChild(d);
      return d;
    });
    let undo = null;
    try {
      if (prep) undo = prep();
      await raf2();
      await sleep(90);
      const rect = measure ? measure() : null;
      const res = hasChrome
        ? await chrome.runtime.sendMessage({ type: "zmv:capture", windowId: WIN })
        : { error: "No extension context" };
      if (!res || res.error) throw new Error((res && res.error) || "Capture failed");
      const img = new Image();
      img.src = res.dataUrl;
      await img.decode();
      return { img, rect, map: calibrate(img) };
    } finally {
      if (undo) undo();
      marks.forEach((m) => m.remove());
      void document.body.offsetWidth;
      document.body.classList.remove("capturing");
    }
  }

  function calibrate(img) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const rw = Math.max(16, Math.ceil(W * 0.06)), rh = Math.max(16, Math.ceil(H * 0.06));
    const find = (x0, y0, w, h) => {
      const d = ctx.getImageData(x0, y0, w, h).data;
      let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (d[i] > 200 && d[i + 1] < 70 && d[i + 2] > 200) {
            if (x < minX) minX = x; if (y < minY) minY = y;
            if (x > maxX) maxX = x; if (y > maxY) maxY = y;
          }
        }
      return maxX < 0 ? null : { minX: minX + x0, minY: minY + y0, maxX: maxX + x0, maxY: maxY + y0 };
    };
    const tl = find(0, 0, rw, rh);
    const br = find(W - rw, H - rh, rw, rh);
    let ox = 0, oy = 0, sx = W / window.innerWidth, sy = H / window.innerHeight;
    if (tl && br && br.maxX > tl.minX && br.maxY > tl.minY) {
      ox = tl.minX; oy = tl.minY;
      sx = (br.maxX + 1 - ox) / window.innerWidth;
      sy = (br.maxY + 1 - oy) / window.innerHeight;
    }
    return (r) => ({ x: ox + r.left * sx, y: oy + r.top * sy, w: r.width * sx, h: r.height * sy, s: sx });
  }

  // Shows one device alone, as large as possible (1:1 when it fits), for a crisp capture.
  function soloPrep(slot, withFrame) {
    const g = slot.g, el = slot.el, ds = $(".dev-scale", el);
    const PAD = 14;
    document.body.classList.add("solo-shot");
    if (!withFrame) document.body.classList.add("screen-only");
    el.classList.add("shot-target");
    const base = el.getBoundingClientRect();
    let sc, tx, ty;
    if (withFrame) {
      sc = Math.min(1, (innerWidth - PAD * 2) / (g.tw + 12), (innerHeight - PAD * 2) / (g.th + 12));
      tx = PAD + 6 * sc - base.left;
      ty = PAD + 6 * sc - base.top;
    } else {
      const fx = (g.tw - g.fw) / 2 + g.pad.l, fy = g.pad.t;
      sc = Math.min(1, (innerWidth - PAD * 2) / g.vw, (innerHeight - PAD * 2) / g.vh);
      tx = PAD - base.left - fx * sc;
      ty = PAD - base.top - fy * sc;
    }
    ds.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`;
    slot.shotScale = sc;
    return () => {
      ds.style.transform = "";
      el.classList.remove("shot-target");
      document.body.classList.remove("solo-shot", "screen-only");
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function download(blobOrUrl, filename) {
    const a = document.createElement("a");
    const url = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (typeof blobOrUrl !== "string") setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function cropTo(img, m, clipRadius) {
    const x = Math.round(m.x), y = Math.round(m.y);
    const w = Math.round(m.w), h = Math.round(m.h);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (clipRadius) { roundRect(ctx, 0, 0, w, h, clipRadius); ctx.clip(); }
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
    return new Promise((res) => c.toBlob(res, "image/png"));
  }

  async function screenshot(slot) {
    slot = slot || activeSlot();
    const d = getDev(slot);
    const withFrame = state.settings.shotStyle === "frame";
    try {
      const { img, rect, map } = await capture(
        () => soloPrep(slot, withFrame),
        () => {
          if (!withFrame) return $(".screen", slot.el).getBoundingClientRect();
          const t = d.kind === "desktop" ? $(".dev-scale", slot.el) : $(".frame", slot.el);
          const b = t.getBoundingClientRect();
          if (d.kind === "desktop") {
            // .dev-scale's box is unscaled layout size; use the scaled visual size
            return { left: b.left, top: b.top, width: slot.g.tw * slot.shotScale, height: slot.g.th * slot.shotScale };
          }
          const rim = 6 * slot.shotScale;
          return { left: b.left - rim, top: b.top - rim, width: b.width + rim * 2, height: b.height + rim * 2 };
        }
      );
      flashShutter();
      const m = map(rect);
      const radius = withFrame && d.kind !== "desktop" ? (slot.g.radius + 6) * slot.shotScale * m.s : 0;
      const blob = await cropTo(img, m, radius);
      download(blob, `prism-${slug(d.name)}-${stamp()}.png`);
      toast(`Saved ${d.name} screenshot (${Math.round(m.w)} × ${Math.round(m.h)})`, "camera");
    } catch (e) {
      toast("Screenshot failed — " + e.message, "x", true);
    }
  }

  async function screenshotAll() {
    try {
      const { img, rect, map } = await capture(null, () => {
        const rs = visibleSlots().map((s) => {
          const b = $(".dev-scale", s.el).getBoundingClientRect();
          return { left: b.left, top: b.top, right: b.left + s.g.tw * ui.scale, bottom: b.top + s.g.th * ui.scale };
        });
        const pad = 36;
        const l = Math.max(0, Math.min(...rs.map((r) => r.left)) - pad);
        const t = Math.max(0, Math.min(...rs.map((r) => r.top)) - pad);
        const r = Math.min(innerWidth, Math.max(...rs.map((r) => r.right)) + pad);
        const b = Math.min(innerHeight, Math.max(...rs.map((r) => r.bottom)) + pad);
        return { left: l, top: t, width: r - l, height: b - t };
      });
      flashShutter();
      const blob = await cropTo(img, map(rect), 0);
      download(blob, `prism-all-devices-${stamp()}.png`);
      toast("Saved all-devices screenshot", "camera");
    } catch (e) {
      toast("Screenshot failed — " + e.message, "x", true);
    }
  }

  function flashShutter() {
    const f = document.createElement("div");
    f.className = "shutter";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 600);
  }

  // ───────────────────────── recording ─────────────────────────
  async function toggleRecord() {
    if (ui.rec) return ui.rec.mr.state !== "inactive" && ui.rec.mr.stop();
    const slot = activeSlot();
    const d = getDev(slot);
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 60, displaySurface: "browser" },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "exclude"
      });
    } catch (e) {
      return toast("Recording cancelled", "video");
    }
    const [track] = stream.getVideoTracks();
    let cropped = false;
    try {
      if (window.CropTarget && track.cropTo) {
        const target = await CropTarget.fromElement($(".frame", slot.el));
        await track.cropTo(target);
        cropped = true;
      }
    } catch (e) {
      console.warn("[Prism] crop failed, recording whole tab", e);
    }
    const mime = ["video/mp4;codecs=avc1.640028", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((m) =>
      window.MediaRecorder && MediaRecorder.isTypeSupported(m)
    );
    const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 14e6 });
    const chunks = [];
    mr.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(ui.rec.timer);
      ui.rec = null;
      $("#btnRec").classList.remove("on");
      const ext = mime && mime.includes("mp4") ? "mp4" : "webm";
      download(new Blob(chunks, { type: mime }), `prism-${slug(d.name)}-${stamp()}.${ext}`);
      toast("Recording saved", "video");
    };
    track.addEventListener("ended", () => mr.state !== "inactive" && mr.stop());
    mr.start(250);
    const t0 = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      $("#recTime").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    }, 250);
    $("#recTime").textContent = "00:00";
    ui.rec = { mr, timer };
    $("#btnRec").classList.add("on");
    toast(cropped ? `Recording ${d.name} — click again to stop` : "Recording tab — click again to stop", "video");
  }

  // ───────────────────────── toasts ─────────────────────────
  function toast(msg, icon, bad) {
    const t = document.createElement("div");
    t.className = "toast" + (bad ? " bad" : "");
    t.innerHTML = `${ico(icon || "check")}<span></span>`;
    t.querySelector("span").textContent = msg;
    $("#toasts").appendChild(t);
    setTimeout(() => t.classList.add("out"), 2400);
    setTimeout(() => t.remove(), 2800);
  }

  // ───────────────────────── toolbar wiring ─────────────────────────
  function toggleMin(v = !state.minimized) {
    state.minimized = v;
    if (v) closePops();
    layout();
    save();
  }
  function toggleSpot(v = !state.spotlight) {
    flipLayout(() => {
      state.spotlight = v;
      $("#btnSpot").classList.toggle("on", v);
    });
    save();
  }
  function close() {
    if (ui.rec) ui.rec.mr.stop();
    closePops();
    const vs = visibleSlots();
    vs.forEach((s, k) => (s.el.style.animationDelay = (vs.length - 1 - k) * 45 + "ms"));
    document.body.classList.add("leaving");
    setTimeout(() => {
      if (EMBEDDED) window.parent.postMessage({ __zmvStage: 1, type: "close" }, "*");
      else window.close();
    }, 330);
  }

  $("#devSelect").addEventListener("click", (e) => (ui.openPop === "dev" && e.currentTarget.classList.contains("open") ? closePops() : openDevPanel(state.active)));
  $("#btnMulti").addEventListener("click", (e) => {
    if (ui.openPop === "dev" && e.currentTarget.classList.contains("open")) return closePops();
    openDevPanel(state.active, e.currentTarget);
  });
  $("#btnSettings").addEventListener("click", (e) => {
    if (ui.openPop === "settings") return closePops();
    closePops();
    ui.openPop = "settings";
    renderSettings();
    e.currentTarget.classList.add("open");
    placePop(setPanel, e.currentTarget);
  });
  $("#btnFold")?.addEventListener("click", () => foldToggle());
  $("#btnRotate").addEventListener("click", () => rotate());
  $("#btnSync").addEventListener("click", () => setSetting("syncScroll", !state.settings.syncScroll));
  $("#btnShot").addEventListener("click", (e) => (e.shiftKey ? screenshotAll() : screenshot()));
  $("#btnRec").addEventListener("click", toggleRecord);
  $("#btnSpot").addEventListener("click", () => toggleSpot());
  $("#btnTheme").addEventListener("click", () => setSetting("theme", state.settings.theme === "dark" ? "light" : "dark"));
  $("#btnMin").addEventListener("click", () => toggleMin(true));
  $("#pill").addEventListener("click", () => toggleMin(false));
  $("#btnClose").addEventListener("click", close);
  $("#zoomRange").addEventListener("input", (e) => setZoom(+e.target.value / 100));
  $("#zoomIn").addEventListener("click", () => setZoom(currentScale() + 0.1));
  $("#zoomOut").addEventListener("click", () => setZoom(currentScale() - 0.1));
  $("#zoomFit").addEventListener("click", () => setZoom("fit"));

  const tb = $("#toolbar");
  tb.addEventListener("pointermove", (e) => {
    const r = tb.getBoundingClientRect();
    tb.style.setProperty("--mx", e.clientX - r.left + "px");
    tb.style.setProperty("--my", e.clientY - r.top + "px");
  });
  devPanel.addEventListener("pointermove", (e) => {
    const c = e.target.closest(".card");
    if (ui.tilt && ui.tilt !== c) ui.tilt.style.transform = "";
    ui.tilt = c;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    c.style.transform = `perspective(420px) rotateX(${(-y * 14).toFixed(2)}deg) rotateY(${(x * 16).toFixed(2)}deg) translateY(-3px)`;
    c.style.setProperty("--gx", (x + 0.5) * 100 + "%");
    c.style.setProperty("--gy", (y + 0.5) * 100 + "%");
  });
  devPanel.addEventListener("pointerleave", () => {
    if (ui.tilt) ui.tilt.style.transform = "";
    ui.tilt = null;
  });

  stage.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(currentScale() * (e.deltaY < 0 ? 1.08 : 0.92));
    },
    { passive: false }
  );
  stage.addEventListener("pointerdown", (e) => {
    if (e.target === stage || e.target === row) closePops();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === "Escape") return ui.openPop ? closePops() : close();
    if (k === "r" || k === "R") rotate();
    else if (k === "s") screenshot();
    else if (k === "S") screenshotAll();
    else if (k === "y" || k === "Y") setSetting("syncScroll", !state.settings.syncScroll);
    else if (k === "f" || k === "F") toggleSpot();
    else if (k === "g" || k === "G") foldToggle();
    else if (k === "m" || k === "M") toggleMin();
    else if (k === "t" || k === "T") setSetting("theme", state.settings.theme === "dark" ? "light" : "dark");
    else if (k === "+" || k === "=") setZoom(currentScale() + 0.1);
    else if (k === "-" || k === "_") setZoom(currentScale() - 0.1);
    else if (k === "0") setZoom("fit");
    else if (/^[1-4]$/.test(k)) setActive(+k - 1);
    else return;
    e.preventDefault();
  });

  window.addEventListener("resize", () => {
    if (ui.openPop) closePops();
  });

  // ───────────────────────── boot ─────────────────────────
  async function boot() {
    $$(".ico[data-i]").forEach((n) => (n.innerHTML = ico(n.dataset.i)));
    await load();
    applySettings();
    $("#btnSpot").classList.toggle("on", state.spotlight);
    await updateUA(false);
    state.slots.forEach((s, i) => createSlotEl(s, i, true));
    refreshAll(false);
    setUrlField(startUrl);
    document.body.classList.add("ready");
    window.focus();
  }
  boot();
})();
