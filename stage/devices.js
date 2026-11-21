// Device catalog.
//   w/h   CSS viewport in portrait (what the page sees)
//   mm    physical body [width, height] in portrait (manufacturer specs)
//   res   physical screen pixels [width, height] in portrait, ppi = pixel density
//   sr    screen corner radius in CSS px
// Prism derives px-per-mm from the screen (res/ppi), then draws the body at true scale,
// so bezels, chins and proportions match the real device.
// style: island (Dynamic Island), notch, home (Touch ID), punch (hole-punch), tablet, laptop, monitor
window.ZMV_DEVICES = [
  // ── iPhone ───────────────────────────────────────────
  { id: "ip17pm", cat: "iPhone", name: "iPhone 17 Pro Max", w: 440, h: 956, mm: [78.0, 163.4], res: [1320, 2868], ppi: 460, sr: 62, kind: "phone", os: "ios", style: "island" },
  { id: "ipair",  cat: "iPhone", name: "iPhone Air",        w: 420, h: 912, mm: [74.7, 156.2], res: [1260, 2736], ppi: 460, sr: 60, kind: "phone", os: "ios", style: "island", thin: true },
  { id: "ip17p",  cat: "iPhone", name: "iPhone 17 Pro",     w: 402, h: 874, mm: [71.9, 150.0], res: [1206, 2622], ppi: 460, sr: 58, kind: "phone", os: "ios", style: "island" },
  { id: "ip17",   cat: "iPhone", name: "iPhone 17",         w: 402, h: 874, mm: [71.5, 149.6], res: [1206, 2622], ppi: 460, sr: 58, kind: "phone", os: "ios", style: "island" },
  { id: "ip17e",  cat: "iPhone", name: "iPhone 17e",        w: 390, h: 844, mm: [71.5, 146.7], res: [1170, 2532], ppi: 460, sr: 47, kind: "phone", os: "ios", style: "notch" },
  { id: "ipduo",  cat: "iPhone", name: "iPhone Duo",        w: 466, h: 678, kind: "phone", os: "ios", style: "duo-cover", foldable: true, duo: true, inner: { w: 890, h: 626 } },
  { id: "ip16pm", cat: "iPhone", name: "iPhone 16 Pro Max", w: 440, h: 956, mm: [77.6, 163.0], res: [1320, 2868], ppi: 460, sr: 62, kind: "phone", os: "ios", style: "island" },
  { id: "ip16e",  cat: "iPhone", name: "iPhone 16e",        w: 390, h: 844, mm: [71.5, 146.7], res: [1170, 2532], ppi: 460, sr: 47, kind: "phone", os: "ios", style: "notch" },
  { id: "ip15",   cat: "iPhone", name: "iPhone 15",         w: 393, h: 852, mm: [71.6, 147.6], res: [1179, 2556], ppi: 460, sr: 55, kind: "phone", os: "ios", style: "island" },
  { id: "ipse",   cat: "iPhone", name: "iPhone SE",         w: 375, h: 667, mm: [67.3, 138.4], res: [750, 1334],  ppi: 326, sr: 3,  rb: 9, kind: "phone", os: "ios", style: "home" },

  // ── Android ──────────────────────────────────────────
  { id: "s25u",   cat: "Android", name: "Galaxy S25 Ultra",  w: 412, h: 891, mm: [77.6, 162.8], res: [1440, 3120], ppi: 498, sr: 26, kind: "phone", os: "android", style: "punch", square: true },
  { id: "s25",    cat: "Android", name: "Galaxy S25",        w: 360, h: 780, mm: [70.5, 146.9], res: [1080, 2340], ppi: 416, sr: 40, kind: "phone", os: "android", style: "punch" },
  { id: "px9p",   cat: "Android", name: "Pixel 9 Pro",       w: 427, h: 952, mm: [72.0, 152.8], res: [1280, 2856], ppi: 495, sr: 52, kind: "phone", os: "android", style: "punch" },
  { id: "px9",    cat: "Android", name: "Pixel 9",           w: 360, h: 808, mm: [72.0, 152.8], res: [1080, 2424], ppi: 422, sr: 44, kind: "phone", os: "android", style: "punch" },
  { id: "px8",    cat: "Android", name: "Pixel 8",           w: 412, h: 915, mm: [70.8, 150.5], res: [1080, 2400], ppi: 428, sr: 48, kind: "phone", os: "android", style: "punch" },
  { id: "s24u",   cat: "Android", name: "Galaxy S24 Ultra",  w: 412, h: 891, mm: [79.0, 162.3], res: [1440, 3120], ppi: 505, sr: 24, kind: "phone", os: "android", style: "punch", square: true },
  { id: "s24",    cat: "Android", name: "Galaxy S24",        w: 360, h: 780, mm: [70.6, 147.0], res: [1080, 2340], ppi: 416, sr: 40, kind: "phone", os: "android", style: "punch" },
  { id: "a55",    cat: "Android", name: "Galaxy A55",        w: 412, h: 892, mm: [77.4, 161.1], res: [1080, 2340], ppi: 391, sr: 38, kind: "phone", os: "android", style: "punch" },
  { id: "zfold",  cat: "Android", name: "Galaxy Z Fold 6",   w: 369, h: 905, mm: [68.1, 153.5], res: [968, 2376],  ppi: 410, sr: 30, kind: "phone", os: "android", style: "punch", foldable: true,
    inner: { w: 707, h: 823, mm: [132.6, 153.5], res: [1856, 2160], ppi: 374, sr: 20 } },
  { id: "pfold",  cat: "Android", name: "Pixel 9 Pro Fold",  w: 360, h: 808, mm: [77.1, 155.2], res: [1080, 2424], ppi: 422, sr: 44, kind: "phone", os: "android", style: "punch", foldable: true,
    inner: { w: 755, h: 783, mm: [150.2, 155.2], res: [2076, 2152], ppi: 373, sr: 24 } },
  { id: "zflip",  cat: "Android", name: "Galaxy Z Flip 6",   w: 360, h: 880, mm: [71.9, 165.1], res: [1080, 2640], ppi: 425, sr: 36, kind: "phone", os: "android", style: "punch" },
  { id: "op12",   cat: "Android", name: "OnePlus 12",        w: 412, h: 905, mm: [75.8, 164.3], res: [1440, 3168], ppi: 510, sr: 44, kind: "phone", os: "android", style: "punch" },

  // ── Tablets ──────────────────────────────────────────
  { id: "ipmini",   cat: "Tablet", name: "iPad mini",        w: 744,  h: 1133, mm: [134.8, 195.4], res: [1488, 2266], ppi: 326, sr: 22, kind: "tablet", os: "ios", style: "tablet" },
  { id: "ipadair",  cat: "Tablet", name: "iPad Air 11\"",    w: 820,  h: 1180, mm: [178.5, 247.6], res: [1640, 2360], ppi: 264, sr: 18, kind: "tablet", os: "ios", style: "tablet" },
  { id: "ipadair13",cat: "Tablet", name: "iPad Air 13\"",    w: 1024, h: 1366, mm: [214.9, 280.6], res: [2048, 2732], ppi: 264, sr: 18, kind: "tablet", os: "ios", style: "tablet" },
  { id: "ipadpro",  cat: "Tablet", name: "iPad Pro 13\"",    w: 1032, h: 1376, mm: [215.5, 281.6], res: [2064, 2752], ppi: 264, sr: 18, kind: "tablet", os: "ios", style: "tablet" },
  { id: "tabs10",   cat: "Tablet", name: "Galaxy Tab S10+",  w: 876,  h: 1400, mm: [185.4, 285.4], res: [1752, 2800], ppi: 266, sr: 14, kind: "tablet", os: "android", style: "tablet" },
  { id: "tabs9",    cat: "Tablet", name: "Galaxy Tab S9",    w: 800,  h: 1280, mm: [165.8, 254.3], res: [1600, 2560], ppi: 274, sr: 14, kind: "tablet", os: "android", style: "tablet" },
  { id: "surf",     cat: "Tablet", name: "Surface Pro",      w: 960,  h: 1440, mm: [208.6, 287.0], res: [1920, 2880], ppi: 267, sr: 8,  kind: "tablet", os: "android", style: "tablet" },

  // ── Laptops & desktop ── lid / body = visible display assembly [w, h] mm ──
  { id: "mba13",  cat: "Desktop", name: "MacBook Air 13\"", w: 1280, h: 832,  mm: [304.1, 206.5], res: [2560, 1664], ppi: 224, kind: "desktop", os: "mac", style: "laptop", baseK: 1.02 },
  { id: "mbp16",  cat: "Desktop", name: "MacBook Pro 16\"", w: 1728, h: 1117, mm: [355.7, 236.0], res: [3456, 2234], ppi: 254, kind: "desktop", os: "mac", style: "laptop", baseK: 1.02 },
  { id: "lap",    cat: "Desktop", name: "Laptop HD 15.6\"", w: 1366, h: 768,  mm: [359.0, 222.0], res: [1366, 768],  ppi: 100.5, kind: "desktop", os: "win", style: "laptop", baseK: 1.06 },
  { id: "fhd",    cat: "Desktop", name: "Monitor 24\" 1080p", w: 1920, h: 1080, mm: [540.0, 322.0], res: [1920, 1080], ppi: 91.8, kind: "desktop", os: "win", style: "monitor" },
  { id: "qhd",    cat: "Desktop", name: "Monitor 27\" 1440p", w: 2560, h: 1440, mm: [612.0, 362.0], res: [2560, 1440], ppi: 108.8, kind: "desktop", os: "win", style: "monitor" }
];

window.ZMV_CATS = [
  { id: "iPhone",  label: "iPhone",            icon: "apple" },
  { id: "Android", label: "Android",           icon: "android" },
  { id: "Tablet",  label: "Tablets",           icon: "tablet" },
  { id: "Desktop", label: "Laptops & Desktop", icon: "laptop" }
];

window.ZMV_FINISHES = [
  { id: "midnight", label: "Midnight",      rim: "#1b1b22", hi: "#3a3a46" },
  { id: "titanium", label: "Titanium",      rim: "#8d8a84", hi: "#cfccc5" },
  { id: "silver",   label: "Silver",        rim: "#c9ccd2", hi: "#f4f5f7" },
  { id: "blue",     label: "Deep Blue",     rim: "#2c3c5c", hi: "#5b74a3" },
  { id: "orange",   label: "Cosmic Orange", rim: "#d8641f", hi: "#ff9a52" }
];
