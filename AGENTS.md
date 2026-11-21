# AGENTS.md

## Project

**lampa-prowlarr-category-fix** is a plugin for [Lampa](https://github.com/yumata/lampa) that fixes torrent search through
[Prowlarr](https://github.com/Prowlarr/Prowlarr):

- removes the `categories` parameter so category-less indexers such as RuTor are not dropped as `Other`;
- raises the request timeout to at least 30 seconds for these broader searches;
- filters results by title: keeps releases whose title contains the searched title as a whole phrase, shows all
  results when nothing matches.

User-facing description and settings are in `README.md`.

## Layout

- `prowlarr_category_fix.js`: the whole plugin, a single self-contained file without a build step or dependencies.
  It must run in old TV browsers (webOS, Tizen): ES5 syntax, `var`, no arrow functions, no regex flags or classes
  newer than ES5 (no `u` flag, no `\p{...}`).
- `test/title_filter.test.js`: tests on `node:test`. They load the plugin into `vm` with a stub `Lampa` object and
  drive it through Lampa events.

## Tests

```sh
node --test
```

Write a failing test first, then the fix. Tests check what Lampa receives in `params.complite` and the request URL,
not the plugin internals.

## How it hooks into Lampa

The plugin does not patch Lampa code, it only listens to `Lampa.Listener` events. Lampa source for reference:
[yumata/lampa-source](https://github.com/yumata/lampa-source).

- `src/core/api/sources/parser.js`, function `prowlarr()`: builds `/api/v1/search` with `query`, `categories`
  (5000 for series, 5070 for Japanese) and `type`, then maps the JSON array (`title`, `indexer`, `seeders`, ...).
- `src/utils/reguest.js`: sends `request_before` with `params` before every request, both browser and Android paths.
  The plugin changes `params.url`, `params.timeout` and wraps `params.complite` there.
- `src/interaction/activity/activity.js`: `create()` sends the `activity` event with `type: 'init'` before the
  component starts, so the torrents screen's `search`, `search_one` (card title), `search_two` (original title) and
  `clarification` are known before its Prowlarr request. `replace()` (the "Clarify" search) pushes a copy of the
  object with the typed `search` and `clarification: true`.

Never log the full request URL: it contains the Prowlarr API key.

## Release

- Bump the version in the header comment and in the manifest `version` in `startPlugin()`: patch for fixes, minor
  for features.
- Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`), subject up to 50 characters.
- Lampa loads the plugin from `main` by the raw GitHub URL in `README.md`, so a push to `main` is a release.
  After the push check that the raw URL serves the new version, then reload Lampa and check the settings section
  "Prowlarr Category Fix" and a real search.
