# Changelog

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
