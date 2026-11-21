// Prism — service worker
// Toggles the overlay on the active tab and manages per-tab header rules so
// the page can be framed inside the device previews.

const BLOCKED = /^(chrome|edge|brave|about|chrome-extension|devtools|view-source):/i;
const STORE_RE = /^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i;

async function setRule(tabId, ua) {
  const rule = {
    id: tabId,
    priority: 1,
    action: {
      type: "modifyHeaders",
      responseHeaders: [
        { header: "x-frame-options", operation: "remove" },
        { header: "content-security-policy", operation: "remove" },
        { header: "cross-origin-opener-policy", operation: "remove" },
        { header: "cross-origin-embedder-policy", operation: "remove" }
      ]
    },
    condition: { tabIds: [tabId], resourceTypes: ["sub_frame"] }
  };
  if (ua) {
    const android = /Android/.test(ua);
    rule.action.requestHeaders = [
      { header: "user-agent", operation: "set", value: ua },
      { header: "sec-ch-ua-mobile", operation: "set", value: /Mobile/.test(ua) ? "?1" : "?0" },
      { header: "sec-ch-ua-platform", operation: "set", value: android ? '"Android"' : '"iOS"' }
    ];
  }
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId], addRules: [rule] });
}

async function clearRule(tabId) {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] });
  } catch (_) {}
}

async function flash(tabId, text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {}), 2500);
  } catch (_) {}
}

async function toggleTab(tab) {
  if (!tab || !tab.id) return;
  const url = tab.url || tab.pendingUrl || "";
  if (BLOCKED.test(url) || STORE_RE.test(url)) {
    flash(tab.id, "!", "#ef4444");
    return;
  }
  try {
    // Is the overlay already open? If so, the toggle closes it.
    const [{ result: isOpen } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!(window.__zmvIsOpen && window.__zmvIsOpen())
    });
    if (!isOpen) await setRule(tab.id, null);
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (tabId, winId) => window.__zmvToggle(tabId, winId),
      args: [tab.id, tab.windowId]
    });
  } catch (err) {
    console.warn("[Prism] cannot open on this page:", err);
    flash(tab.id, "!", "#ef4444");
  }
}
self.toggleTab = toggleTab;
chrome.action.onClicked.addListener(toggleTab);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = msg.tabId || (sender.tab && sender.tab.id);
  if (!tabId) return;
  if (msg.type === "zmv:closed") {
    clearRule(tabId);
  } else if (msg.type === "zmv:ua") {
    setRule(tabId, msg.ua || null).then(() => sendResponse({ ok: true }));
    return true;
  } else if (msg.type === "zmv:capture") {
    chrome.tabs
      .captureVisibleTab(msg.windowId, { format: "png" })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((e) => sendResponse({ error: String(e && e.message ? e.message : e) }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => clearRule(tabId));

// Clean up any leftover rules after a browser/extension restart.
chrome.runtime.onStartup.addListener(async () => {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  if (rules.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: rules.map((r) => r.id) });
});
