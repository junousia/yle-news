---
name: yle-news
description: Advanced Yle news monitor and search tool. Fetch, track, and search news from multiple Yle RSS feeds with SQLite persistence, categorized filtering, and AI-ready JSON output.
---

# yle-news

An advanced news monitoring and search tool for Yle Uutiset. Designed for both human CLI use and seamless AI agent integration.

## Features

- **Multi-Feed Support** — Built-in support for 50+ Yle news categories (Talous, Politiikka, Urheilu, etc.).
- **SQLite Persistence** — Stores news items locally for fast searching and historical access.
- **Full-Text Search (FTS5)** — Search through titles, descriptions, and categories.
- **AI-Ready Output & Controls** — Support for `--json` across commands, and machine-friendly commands to toggle active feeds.
- **Categorization** — Automatically tracks and groups output by news categories and publishers.
- **Automatic Retention** — Keeps your local database clean with a configurable retention policy (default: 90 days).

## Quick Start

```bash
# Fetch new news from all enabled feeds
./scripts/check-news.sh check

# Search for specific topics from the last 2 days
./scripts/check-news.sh search "NATO" --days=2

# Get recent history grouped by category
./scripts/check-news.sh history --limit=10

# View statistics
./scripts/check-news.sh stats
```

## CLI Commands

- `check` - Fetches new news from enabled feeds.
- `search <query>` - Searches news history (supports full-text search).
- `history` - Shows the most recent news.
- `stats` - Displays statistics about stored news.

### Feed Management (AI-Friendly)
Agents should use these commands to manage which news categories are actively monitored:
- `list` - Lists all available feed categories and shows if they are enabled/disabled. Supports `--json`.
- `enable <category1> <category2> ...` - Enables specific categories (case-insensitive).
- `disable <category1> <category2> ...` - Disables specific categories.
- `configure` - Launches an interactive TUI (for human users) to toggle feeds.

## Advanced Filtering

Use these flags with `check`, `search`, or `history` to narrow down results. *Note: Disabling a feed automatically hides its past articles from `history` and `search` unless you explicitly override it using the `--category` flag.*

- `--days=N` - Only show news from the last N days.
- `--hours=N` - Only show news from the last N hours.
- `--category="Name"` - Filter by category (e.g., "politiikka"). Overrides disabled feed filters.
- `--publisher="Name"` - Filter by publisher (e.g., "Yle Uutiset").
- `--limit=N` - Limit the number of results returned (default: 20).
- `--json` - Output raw JSON instead of formatted text.

## Configuration

Configuration is stored in `references/config.json`. The `feeds` property is a dictionary mapping Category Names to their RSS URLs. The `disabledFeeds` array tracks which feeds are currently toggled off.

## Developer & AI Agent Integration

The tool is highly optimized for programmatic use. All commands, including `list`, support the `--json` flag. When using `--json`, all human-readable formatting and grouping is bypassed, yielding an array of objects.

### News Item JSON Schema

```json
{
  "id": "string",
  "title": "string",
  "description": "string (cleaned plain text)",
  "link": "url",
  "pubDate": "ISO8601 string",
  "author": "string",
  "categories": "string (comma-separated tags)",
  "publisher": "string",
  "foundAt": "ISO8601 string",
  "feedCategory": "string (The category name from config.json)"
}
```
