# Game server security notes

## CVE-2026-90711 / GHSA-jqcg-44mw-7w3h (`proxy-addr`)

**Advisory:** Critical issue in `proxy-addr` versions prior to 2.0.8, pulled in by Express for trusted-proxy / client IP handling.

**Lockfile:** `server/package-lock.json` pins the installed copy at **proxy-addr 2.0.8** from `registry.npmjs.org` (via `npm update proxy-addr` on Express 4.22.x). Express’s own `package.json` still declares the range `~2.0.7`; npm resolves that range to 2.0.8 in the lockfile.

**Reachability (code review):** As of this note, the game server does **not** enable Express `trust proxy` and does **not** use `req.ip` or `req.ips` anywhere under `server/`. The vulnerable code path was therefore **not reachable** in production configuration, but the dependency is patched anyway for defense in depth.

**Future changes:** If you add `app.set('trust proxy', …)` or start using `req.ip` / `req.ips` (for example behind Cloud Run or another reverse proxy), keep `proxy-addr` at **2.0.8 or newer** and re-run `npm audit` on the server lockfile.