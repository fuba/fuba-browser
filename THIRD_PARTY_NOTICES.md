# Third-Party Notices

This file lists third-party software included in or distributed with fuba-browser,
along with their respective licenses. The fuba-browser project itself is licensed
under the [MIT License](LICENSE).

---

## System Packages (included in Docker image via Debian packages)

These components are installed from official Debian repositories and are not modified.
Source packages are available from the Debian archive: https://packages.debian.org/

### noVNC

- **License:** MPL-2.0 (Mozilla Public License 2.0)
- **Project:** https://github.com/novnc/noVNC
- **Description:** HTML5 VNC client used for browser-based remote desktop access
- **Source:** Installed from Debian package `novnc`. Original source available at the project URL above.

### websockify

- **License:** LGPL-3.0
- **Project:** https://github.com/novnc/websockify
- **Description:** WebSocket to TCP proxy, used as a bridge between noVNC and x11vnc
- **Source:** Installed from Debian package `websockify`. Original source available at the project URL above.

### x11vnc

- **License:** GPL-2.0
- **Project:** https://github.com/LibVNC/x11vnc
- **Description:** VNC server for real X11 displays, provides remote access to the browser viewport
- **Source:** Installed from Debian package `x11vnc`. Original source available at the project URL above and via `apt-get source x11vnc`.

### Xvfb (X Virtual Framebuffer)

- **License:** MIT/X11
- **Project:** https://www.x.org/
- **Description:** Virtual framebuffer X server for headless display
- **Source:** Installed from Debian package `xvfb`.

### Fluxbox

- **License:** MIT
- **Project:** http://fluxbox.org/
- **Description:** Lightweight X11 window manager
- **Source:** Installed from Debian package `fluxbox`.

### Supervisor

- **License:** BSD-like (Supervisor license)
- **Project:** http://supervisord.org/
- **Description:** Process control system for managing application processes
- **Source:** Installed from Debian package `supervisor`.

### Noto CJK Fonts

- **License:** OFL-1.1 (SIL Open Font License 1.1)
- **Project:** https://github.com/googlefonts/noto-cjk
- **Description:** CJK (Chinese, Japanese, Korean) font family
- **Source:** Installed from Debian packages `fonts-noto-cjk` and `fonts-noto-cjk-extra`.

### Liberation Fonts

- **License:** OFL-1.1 (SIL Open Font License 1.1)
- **Project:** https://github.com/liberationfonts/liberation-fonts
- **Description:** Metrically compatible with Times New Roman, Arial, and Courier New
- **Source:** Installed from Debian package `fonts-liberation`.

---

## Playwright / Chromium

- **Playwright License:** Apache-2.0
- **Chromium License:** BSD-style (Chromium license)
- **Playwright Project:** https://github.com/microsoft/playwright
- **Chromium Project:** https://www.chromium.org/
- **Description:** Browser automation library and bundled Chromium browser engine
- **Source:** Installed via `npx playwright install chromium`.

---

## Node.js Runtime Dependencies

| Package | License | Project URL |
|---------|---------|-------------|
| express | MIT | https://github.com/expressjs/express |
| cors | MIT | https://github.com/expressjs/cors |
| turndown | MIT | https://github.com/mixmark-io/turndown |
| dotenv | BSD-2-Clause | https://github.com/motdotla/dotenv |
| playwright | Apache-2.0 | https://github.com/microsoft/playwright |

### CLI Dependencies (fbb)

| Package | License | Project URL |
|---------|---------|-------------|
| commander | MIT | https://github.com/tj/commander.js |
| chalk | MIT | https://github.com/chalk/chalk |

---

## Docker Base Image

- **Image:** `node:25-slim` (Node.js on Debian slim)
- **Node.js License:** MIT
- **Project:** https://nodejs.org/

---

## GPL / Copyleft Compliance Note

This project distributes x11vnc (GPL-2.0) and websockify (LGPL-3.0) as unmodified
Debian packages within the Docker image. Source code for these components can be
obtained by:

1. Running `apt-get source <package-name>` inside the Docker container
2. Downloading from the upstream project URLs listed above
3. Downloading from the Debian source archive at https://packages.debian.org/
