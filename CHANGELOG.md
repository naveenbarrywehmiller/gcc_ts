# Changelog

## [1.11.2](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.11.1...v1.11.2) (2026-09-27)


### Bug Fixes

* reject weak or missing production JWT secrets
* align Microsoft Entra session claims with local authentication
* fix manager approval error handling
* make root build, lint, test, and start commands available
* make the authentication smoke-test fixture deterministic

## [1.11.1](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.11.0...v1.11.1) (2026-09-27)


### Bug Fixes

* grant system admin role full access in authorize middleware and admin routes ([c58209a](https://github.com/naveenbarrywehmiller/gcc_ts/commit/c58209a7b2649e76b22ca0ea5994faa50d2ead4a))

## [1.11.0](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.10.0...v1.11.0) (2026-09-27)


### Features

* format backup filename timestamp as clean YYYY-MM-DD_HH-mm-ss and expose Content-Disposition ([b223809](https://github.com/naveenbarrywehmiller/gcc_ts/commit/b2238092c947ff1db676d4eaa69d1c2a1ff19d4d))

## [1.10.0](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.9.5...v1.10.0) (2026-09-27)


### Features

* add direct PC database download and restore upload options in System Maintenance ([07dee0f](https://github.com/naveenbarrywehmiller/gcc_ts/commit/07dee0f1c00267be77d5b2a18796ad12979ff44a))

## [1.9.5](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.9.4...v1.9.5) (2026-09-27)


### Bug Fixes

* support HTTP LAN deployments by relaxing cookie Secure flag and adding Bearer token fallback ([7ab0769](https://github.com/naveenbarrywehmiller/gcc_ts/commit/7ab0769ff4cd61cc99950e02f3ffab0a22c59175))

## [1.9.4](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.9.3...v1.9.4) (2026-09-27)


### Bug Fixes

* CORS wildcard breaks cookie auth — reflect request origin when CORS_ORIGIN=* ([a1d166d](https://github.com/naveenbarrywehmiller/gcc_ts/commit/a1d166d159aa4656c8339761a4a5793988ea9513))

## [1.9.3](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.9.2...v1.9.3) (2026-09-27)


### Bug Fixes

* correct DB path resolution — was writing to src/data/ instead of volume-mounted data/ ([b12b91b](https://github.com/naveenbarrywehmiller/gcc_ts/commit/b12b91bef2fcd02b915cc00a52b44621f634b1b9))
* use absolute DB_PATH in docker-compose to avoid path.resolve() issues ([5b836f4](https://github.com/naveenbarrywehmiller/gcc_ts/commit/5b836f4c47d20fa4310d50db8c13e7a962c0defb))

## [1.9.2](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.9.1...v1.9.2) (2026-09-27)


### Bug Fixes

* make remaining seed inserts idempotent (INSERT OR IGNORE) ([c464c49](https://github.com/naveenbarrywehmiller/gcc_ts/commit/c464c4921cc4c25e171845ddcc4b0cde5d64b621))

## [1.9.1](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.9.0...v1.9.1) (2026-09-27)


### Bug Fixes

* prevent UNIQUE constraint crash on container restart ([17b9669](https://github.com/naveenbarrywehmiller/gcc_ts/commit/17b9669daa53c4811eb58675fd2cafd830ee44e4))
* use INSERT OR IGNORE for users seed to prevent UNIQUE constraint crash on restart ([d8ef0e8](https://github.com/naveenbarrywehmiller/gcc_ts/commit/d8ef0e88609683fac3fead9ff9a9f47f13de2ca7))

## [1.9.0](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.8.0...v1.9.0) (2026-09-27)


### Features

* change default sysadmin password to systemadmin and fix role dropdown ([fa28764](https://github.com/naveenbarrywehmiller/gcc_ts/commit/fa287647775667e56ec178c637f836a6e6d85ebd))


### Bug Fixes

* ensure sysadmin user is created on existing databases during migration ([2af032d](https://github.com/naveenbarrywehmiller/gcc_ts/commit/2af032d5612c3cc04bb93d68f3851cfefc06407e))

## [1.8.0](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.7.2...v1.8.0) (2026-09-27)


### Features

* implement system maintenance and sysadmin role protection ([149cd6b](https://github.com/naveenbarrywehmiller/gcc_ts/commit/149cd6b7050fa79b20a618539cf90ee0e926abcb))

## [1.7.2](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.7.1...v1.7.2) (2026-09-27)


### Bug Fixes

* **ci:** remove single-arch docker-build from release-please and add package version tagging to multi-arch workflow ([a562058](https://github.com/naveenbarrywehmiller/gcc_ts/commit/a56205881f62814095426f52b50c3350e97e1645))

## [1.7.1](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.7.0...v1.7.1) (2026-09-27)


### Bug Fixes

* correctly expose release version in /api/health — copy root package.json into Docker image ([ce5602d](https://github.com/naveenbarrywehmiller/gcc_ts/commit/ce5602d616b4142d6edc4a53adb9c7f0d95dd79b))

## [1.7.0](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.6.1...v1.7.0) (2026-09-27)


### Features

* show github release version in footer and login page instead of hardcoded year ([e0a17bc](https://github.com/naveenbarrywehmiller/gcc_ts/commit/e0a17bcab1116390d3e19fb2ea7eb9dfab6058d3))

## [1.6.1](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.6.0...v1.6.1) (2026-09-27)


### Bug Fixes

* **docker:** switch base image to debian-slim to eliminate better-sqlite3 segfault on ARM64 ([386514e](https://github.com/naveenbarrywehmiller/gcc_ts/commit/386514e7241dfa03f858feeb8c39031e4dc5827a))
* **docker:** upgrade to Node 22 — required by better-sqlite3 v13 (engines: node&gt;=22) ([33c750f](https://github.com/naveenbarrywehmiller/gcc_ts/commit/33c750f6958996ee9500c8cd142f4af0575b37a8))

## [1.6.0](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.5.0...v1.6.0) (2026-09-27)


### Features

* **docker:** add complete docker-compose configuration and deployment guide ([1539a3f](https://github.com/naveenbarrywehmiller/gcc_ts/commit/1539a3f7a87519df798a0f6cd106bbd16f2b03d3))

## [1.5.0](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.4.0...v1.5.0) (2026-09-25)


### Features

* add missing Power Query M scripts for new API endpoints ([588d9a7](https://github.com/naveenbarrywehmiller/gcc_ts/commit/588d9a7b0d7a1b68e976ec0b55667076c88c8f25))
* add zero-restart maintenance mode and documentation ([d7b0de1](https://github.com/naveenbarrywehmiller/gcc_ts/commit/d7b0de1e83f55a1f199077a56bed039b7a32bdd2))

## [1.4.0](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.3.0...v1.4.0) (2026-09-25)


### Features

* implement comprehensive Power BI dashboard with dedicated reporting API ([9f7f684](https://github.com/naveenbarrywehmiller/gcc_ts/commit/9f7f684e76be44e05565d1b60e0b32d5901849f3))

## [1.3.0](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.2.0...v1.3.0) (2026-09-25)


### Features

* implement secure read-only REST API for Power BI reporting ([646c9fa](https://github.com/naveenbarrywehmiller/gcc_ts/commit/646c9face00e64a5461fc56e23f3fc4a8595f0ae))

## [1.2.0](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.1.0...v1.2.0) (2026-09-25)


### Features

* implement strict admin ownership, timesheet history for all weeks, and recall workflow ([0b33c7a](https://github.com/naveenbarrywehmiller/gcc_ts/commit/0b33c7a3092473faa8b4b1b52c315523479b1162))

## [1.1.0](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.0.1...v1.1.0) (2026-09-25)


### Features

* improve macOS start.command launcher and update better-sqlite3 for Node 26 ([a8e5de6](https://github.com/naveenbarrywehmiller/gcc_ts/commit/a8e5de68dabee4efa47701aef9c2412b88b5029c))


### Bug Fixes

* **docker:** add build dependencies for better-sqlite3 in builder stage ([36cf3a2](https://github.com/naveenbarrywehmiller/gcc_ts/commit/36cf3a28371f3d65cf833830cc0bb992b1e1dfb6))

## [1.0.1](https://github.com/naveenbarrywehmiller/gcc_ts/compare/v1.0.0...v1.0.1) (2026-09-24)


### Bug Fixes

* bump version to test integrated docker build ([8cb0388](https://github.com/naveenbarrywehmiller/gcc_ts/commit/8cb038886d1c59ec8cdb42f8c34046224a8b59ac))

## 1.0.0 (2026-09-24)


### Features

* Add department ownership details feature ([d1a55e3](https://github.com/naveenbarrywehmiller/gcc_ts/commit/d1a55e3d35614297189d3b353950b431f20f91a8))
* migrate timesheet application to Microsoft 365 Architecture (SharePoint, MSAL, Power Automate, Power BI) ([2cf2cf3](https://github.com/naveenbarrywehmiller/gcc_ts/commit/2cf2cf34b112278251651f564f4e53a068c28a86))


### Bug Fixes

* destructure msalEnabled and loginWithMicrosoft from useAuth in Login ([08ece47](https://github.com/naveenbarrywehmiller/gcc_ts/commit/08ece47dce679274b879f95badca217edff492e8))
* escape redirection operator in start.bat to prevent accidental file creation ([f4ab14e](https://github.com/naveenbarrywehmiller/gcc_ts/commit/f4ab14e3a00d18a0d6afb1a0c8efd15800b229c0))
* improve start.bat with DB setup, correct working dir, better startup waits ([f636ce7](https://github.com/naveenbarrywehmiller/gcc_ts/commit/f636ce7de269aaa42f371d2efb07ac3c20f6fb46))
* remove non-existent submitted_at column from SQL query to prevent server crash ([7bd898d](https://github.com/naveenbarrywehmiller/gcc_ts/commit/7bd898dc8b12418354603eb806114830f5f1e968))
