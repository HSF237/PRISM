# Prism Privacy Policy

_Last updated: 22 November 2026_

Prism — Multi-Device Preview does **not collect, store, transmit or sell any personal data**.

- **No accounts, analytics, tracking or ads.** Prism has no server and never sends data anywhere.
- **Settings stay on your device.** Your choices (theme, devices, backdrop) are saved with Chrome's `storage` API in your own browser profile only.
- **Screenshots and recordings stay on your device.** They are saved straight to your computer and are never uploaded.
- **Page content is never read or sent anywhere.** Prism only displays the page you are already viewing inside device frames.

## Why Prism needs its permissions

| Permission | Why |
| --- | --- |
| `activeTab`, `scripting` | Open the Prism preview on the tab you click it on. |
| `declarativeNetRequest` | Remove `X-Frame-Options` / CSP frame headers **only for sub-frames inside the tab where Prism is open**, so the site can load inside the device frames, and set a mobile user-agent for those frames. The rule is removed when you close Prism. |
| `storage` | Remember your settings locally. |
| Host access (all sites) | Prism must work on whatever site you want to preview. |

## Contact

Questions: open an issue at https://github.com/HSF237/PRISM/issues
