// Prism — device emulation inside preview frames (MAIN world).
// Does nothing unless this frame is one of Prism's device previews.
(() => {
  if (window.top === window) return;
  let name;
  try { name = window.name; } catch (_) { return; }
  if (!name || name.indexOf("__zmv|") !== 0) return;

  const [, , kind, os] = name.split("|");
  if (kind !== "phone" && kind !== "tablet") return;

  const UA = {
    "ios-phone": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
    "ios-tablet": "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
    "android-phone": "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
    "android-tablet": "Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
  };
  const ua = UA[`${os}-${kind}`] || UA["android-phone"];
  const ios = os === "ios";

  const def = (obj, key, value) => {
    try { Object.defineProperty(obj, key, { get: () => value, configurable: true }); } catch (_) {}
  };
  const N = Navigator.prototype;
  def(N, "userAgent", ua);
  def(N, "appVersion", ua.replace(/^Mozilla\//, ""));
  def(N, "platform", ios ? (kind === "tablet" ? "iPad" : "iPhone") : "Linux armv81");
  def(N, "maxTouchPoints", 5);
  if (ios) {
    def(N, "vendor", "Apple Computer, Inc.");
    def(N, "userAgentData", undefined);
  }
  try { if (!("ontouchstart" in window)) window.ontouchstart = null; } catch (_) {}

  // Answer pointer/hover media queries like a touch screen would.
  const mm = window.matchMedia.bind(window);
  window.matchMedia = function (q) {
    let s = String(q);
    s = s
      .replace(/\(\s*(any-)?hover\s*:\s*hover\s*\)/g, "(max-width: 0px)")
      .replace(/\(\s*(any-)?hover\s*:\s*none\s*\)/g, "(min-width: 0px)")
      .replace(/\(\s*(any-)?pointer\s*:\s*fine\s*\)/g, "(max-width: 0px)")
      .replace(/\(\s*(any-)?pointer\s*:\s*coarse\s*\)/g, "(min-width: 0px)");
    return mm(s);
  };
})();
