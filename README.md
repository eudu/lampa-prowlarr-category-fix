# lampa-prowlarr-category-fix

Lampa plugin that fixes missing Prowlarr results from indexers without category support, such as RuTor.

## Problem

Lampa normally sends `categories=2000` for movies or `categories=5000` for TV searches. RuTor does not expose categories, so Prowlarr classifies its releases as `Other` and removes them from the final category-filtered response.

This is a known Lampa limitation described in [yumata/lampa#159](https://github.com/yumata/lampa/issues/159). Lampa also has a [global-search fix](https://github.com/yumata/lampa-source/commit/4d74da05799a3ae0f6d5e69c921a12e129ec4fca), but it only helps when the global-search flag reaches the parser correctly.

## Solution

The plugin intercepts configured Prowlarr search requests inside Lampa and removes only the `categories` query parameter. It does not store, modify, or log the Prowlarr API key.

Available modes:

- **All searches** — default and recommended for RuTor.
- **Global search only** — keeps category filtering for ordinary card searches.
- **Disabled** — temporarily disables the fix without removing the plugin.

## Installation

Add the plugin to Lampa by URL:

```text
https://raw.githubusercontent.com/eudu/lampa-prowlarr-category-fix/main/prowlarr_category_fix.js
```

Or, when GitHub Pages is enabled:

```text
https://eudu.github.io/lampa-prowlarr-category-fix/prowlarr_category_fix.js
```

1. Open **Lampa → Settings → Extensions → Add plugin**.
2. Paste one of the URLs above.
3. Restart Lampa.
4. Open **Settings → Prowlarr Category Fix** to select a mode.

## How it works

The plugin listens to Lampa's `request_before` event. For `/api/v1/search` requests sent to the primary or secondary configured Prowlarr URL, it removes `categories` before Lampa sends the request. Other requests and Jackett searches are not changed.

## Security

- No API keys are embedded in the plugin.
- The complete request URL is never logged.
- Only URLs matching the Prowlarr instances configured in Lampa are modified.
