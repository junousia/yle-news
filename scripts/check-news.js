#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filters = void 0;
exports.cleanText = cleanText;
exports.applyFilters = applyFilters;
exports.main = main;
const fs_1 = require("fs");
const path_1 = require("path");
const sqlite3_1 = __importDefault(require("sqlite3"));
const rss_parser_1 = __importDefault(require("rss-parser"));
const prompts_1 = __importDefault(require("prompts"));
const parser = new rss_parser_1.default({
    customFields: {
        item: ['content:encoded', 'author', 'category', 'media:content']
    }
});
// CLI args
const args = process.argv.slice(2);
const command = args.filter(arg => !arg.startsWith('--'))[0] || 'check';
const isJson = args.includes('--json');
// Advanced Filters (AI-ready)
exports.filters = {
    categoryFilter: args.find(a => a.startsWith('--category='))?.split('=')[1],
    publisherFilter: args.find(a => a.startsWith('--publisher='))?.split('=')[1]
};
const limitArg = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '20');
const daysArg = parseInt(args.find(a => a.startsWith('--days='))?.split('=')[1] || '0');
const hoursArg = parseInt(args.find(a => a.startsWith('--hours='))?.split('=')[1] || '0');
// Paths
const configPath = (0, path_1.join)(__dirname, '..', 'references', 'config.json');
// Helper to clean HTML & RSS fluff
function cleanText(text) {
    if (!text)
        return '';
    // Strip HTML tags
    let cleaned = text.replace(/<[^>]*>?/gm, '');
    // Unescape common HTML entities
    const entities = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&nbsp;': ' ',
        '&euro;': '€',
        '&copy;': '©',
        '&reg;': '®'
    };
    return cleaned.replace(/&[a-z0-9#]+;/gi, (match) => entities[match] || match).trim();
}
// Filter logic helper for AI queries
function applyFilters(items, config, overrideCategory, overridePublisher) {
    const disabled = config.disabledFeeds || [];
    const activeCategoryFilter = overrideCategory || exports.filters.categoryFilter;
    const activePublisherFilter = overridePublisher || exports.filters.publisherFilter;
    return items.filter(d => {
        if (activePublisherFilter && (!d.publisher || !d.publisher.toLowerCase().includes(activePublisherFilter.toLowerCase())))
            return false;
        if (activeCategoryFilter) {
            // Override default behavior: search for category in both feedCategory and tags
            const matchFeed = d.feedCategory && d.feedCategory.toLowerCase().includes(activeCategoryFilter.toLowerCase());
            const matchTag = d.categories && d.categories.toLowerCase().includes(activeCategoryFilter.toLowerCase());
            if (!matchFeed && !matchTag)
                return false;
        }
        else {
            // Hide old items that belong to currently disabled feeds
            if (d.feedCategory && disabled.includes(d.feedCategory))
                return false;
        }
        return true;
    });
}
// Load config
function loadConfig() {
    const defaults = {
        feeds: { "Yle": "https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET" },
        stateFile: ".yle-news-state.db",
        notifyOnNew: true,
        watchlist: [],
        importantCategories: [],
        skipCategories: [],
        retentionDays: 90
    };
    try {
        const config = JSON.parse((0, fs_1.readFileSync)(configPath, 'utf-8'));
        return { ...defaults, ...config };
    }
    catch (e) {
        return defaults;
    }
}
// Database setup
function getDb(dbPath) {
    const db = new sqlite3_1.default.Database(dbPath);
    db.serialize(() => {
        db.exec(`
      CREATE TABLE IF NOT EXISTS news (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        title TEXT,
        description TEXT,
        link TEXT,
        pubDate TEXT,
        author TEXT,
        categories TEXT,
        publisher TEXT,
        foundAt TEXT NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_news_external_id ON news(external_id);
      CREATE INDEX IF NOT EXISTS idx_news_pubDate ON news(pubDate);
      CREATE INDEX IF NOT EXISTS idx_news_foundAt ON news(foundAt);
      
      CREATE VIRTUAL TABLE IF NOT EXISTS news_fts USING fts5(title, description, categories, content='news', content_rowid='rowid');
    `);
        // Add feedCategory column if it doesn't exist (ignore error if it does)
        db.run('ALTER TABLE news ADD COLUMN feedCategory TEXT', () => { });
    });
    return db;
}
// Fetch RSS via fetch API
async function fetchRss(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.text();
}
// Parse XML to extract news
async function parseNews(xml, feedUrl, feedCategory) {
    const foundAt = new Date().toISOString();
    const feed = await parser.parseString(xml);
    const publisher = feed.title || "Yle";
    return feed.items.map(item => {
        // rss-parser puts categories in 'categories' (array) or 'category' (string)
        const rawCategories = item.categories || item.category || [];
        const categoriesStr = Array.isArray(rawCategories) ? rawCategories.join(', ') : String(rawCategories);
        const content = cleanText(item.contentSnippet || item.content || '');
        return {
            id: item.guid || item.link || '',
            title: cleanText(item.title || 'Untitled'),
            description: content,
            link: item.link || '',
            pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : '',
            author: item.creator || item.author || '',
            categories: categoriesStr.toLowerCase(),
            publisher: String(publisher),
            foundAt,
            feedCategory
        };
    }).filter(d => d.id);
}
// Command: check (fetch new news)
async function cmdCheck() {
    const config = loadConfig();
    const dbPath = (0, path_1.join)(__dirname, '..', config.stateFile);
    const db = getDb(dbPath);
    const feedEntries = Object.entries(config.feeds);
    if (!isJson)
        console.log(`🔍 Checking ${feedEntries.length} feed(s)...\n`);
    const allNewItems = [];
    for (const [feedCategory, feedUrl] of feedEntries) {
        if (config.disabledFeeds?.includes(feedCategory))
            continue;
        try {
            const xml = await fetchRss(feedUrl);
            const items = await parseNews(xml, feedUrl, feedCategory);
            const newItems = [];
            for (const item of items) {
                const exists = await new Promise((resolve) => {
                    db.get('SELECT 1 FROM news WHERE external_id = ?', [item.id], (err, row) => {
                        resolve(!!row);
                    });
                });
                if (!exists) {
                    await new Promise((resolve, reject) => {
                        db.run('INSERT INTO news (external_id, title, description, link, pubDate, author, categories, publisher, foundAt, feedCategory) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [item.id, item.title, item.description, item.link, item.pubDate, item.author, item.categories, item.publisher, item.foundAt, item.feedCategory], function (err) {
                            if (err)
                                return reject(err);
                            const lastId = this.lastID;
                            db.run('INSERT INTO news_fts(rowid, title, description, categories) VALUES (?, ?, ?, ?)', [lastId, item.title, item.description, item.categories], (err2) => {
                                if (err2)
                                    return reject(err2);
                                resolve();
                            });
                        });
                    });
                    newItems.push(item);
                }
            }
            if (newItems.length > 0) {
                if (!isJson) {
                    console.log(`📦 [${feedCategory}] ${feedUrl}: ${newItems.length} new items`);
                    for (const item of newItems) {
                        console.log(`  • ${item.title}`);
                        console.log(`    ${item.link}\n`);
                    }
                }
                allNewItems.push(...newItems);
            }
            else if (!isJson) {
                console.log(`✓ [${feedCategory}] ${feedUrl}: No new news`);
            }
        }
        catch (error) {
            if (!isJson)
                console.error(`❌ Error fetching [${feedCategory}] ${feedUrl}:`, error);
        }
    }
    // Cleanup old news
    if (config.retentionDays > 0) {
        db.run('DELETE FROM news WHERE foundAt < date("now", ?)', [`-${config.retentionDays} days`]);
        db.run('DELETE FROM news_fts WHERE rowid NOT IN (SELECT rowid FROM news)');
    }
    db.close();
    const filtered = applyFilters(allNewItems, config);
    if (isJson) {
        console.log(JSON.stringify(filtered, null, 2));
    }
    else if (filtered.length > 0) {
        console.log(`\n✨ Total: ${filtered.length} new news items found matching filters.`);
    }
    else {
        console.log(`\n💤 No new news items matching filters.`);
    }
}
// Command: search
async function cmdSearch(query) {
    const config = loadConfig();
    const db = getDb((0, path_1.join)(__dirname, '..', config.stateFile));
    let timeFilterStr = '';
    let timeParams = [];
    if (daysArg > 0) {
        const cutoff = new Date(Date.now() - daysArg * 24 * 60 * 60 * 1000).toISOString();
        timeFilterStr = ` AND pubDate >= ?`;
        timeParams.push(cutoff);
    }
    else if (hoursArg > 0) {
        const cutoff = new Date(Date.now() - hoursArg * 60 * 60 * 1000).toISOString();
        timeFilterStr = ` AND pubDate >= ?`;
        timeParams.push(cutoff);
    }
    const ftsQuery = `SELECT news.*, external_id as id FROM news JOIN news_fts ON news.rowid = news_fts.rowid WHERE news_fts MATCH ?${timeFilterStr} ORDER BY rank LIMIT ?`;
    const searchTerm = query && (query.includes('*') || query.includes(' ')) ? query : (query ? `${query}*` : '');
    if (searchTerm) {
        db.all(ftsQuery, [searchTerm, ...timeParams, limitArg], (err, rows) => {
            if (err || (rows && rows.length === 0)) {
                db.all(`SELECT *, external_id as id FROM news WHERE (title LIKE ? OR description LIKE ?)${timeFilterStr} ORDER BY pubDate DESC LIMIT ?`, [`%${query}%`, `%${query}%`, ...timeParams, limitArg], (err2, rows2) => {
                    handleRows(rows2 || []);
                });
            }
            else {
                handleRows(rows || []);
            }
        });
    }
    else {
        // History / Recent
        // Use WHERE 1=1 so we can blindly append AND pubDate >= ? if needed
        db.all(`SELECT *, external_id as id FROM news WHERE 1=1${timeFilterStr} ORDER BY pubDate DESC LIMIT ?`, [...timeParams, limitArg], (err, rows) => {
            handleRows(rows || []);
        });
    }
    function handleRows(rows) {
        const items = applyFilters(rows, config);
        if (isJson) {
            console.log(JSON.stringify(items, null, 2));
        }
        else if (items.length === 0) {
            console.log('No matches found.');
        }
        else {
            if (query)
                console.log(`🔍 Found ${items.length} match(es) for "${query}":\n`);
            else
                console.log(`📜 Recent ${items.length} news items:\n`);
            // Group items by category for cleaner output
            const grouped = {};
            for (const item of items) {
                const groupName = item.feedCategory || item.publisher || 'Muu';
                if (!grouped[groupName])
                    grouped[groupName] = [];
                grouped[groupName].push(item);
            }
            for (const [group, groupItems] of Object.entries(grouped)) {
                console.log(`\n━━━━━━━━━━ ${group} ━━━━━━━━━━`);
                for (const item of groupItems) {
                    const date = item.pubDate ? new Date(item.pubDate).toLocaleString('fi-FI') : '?';
                    console.log(`📰 [${date}] ${item.title}`);
                    console.log(`   ${item.link}`);
                }
            }
            console.log(); // Trailing newline
        }
        db.close();
    }
}
// Command: stats
async function cmdStats() {
    const config = loadConfig();
    const db = getDb((0, path_1.join)(__dirname, '..', config.stateFile));
    db.all('SELECT publisher, COUNT(*) as count FROM news GROUP BY publisher', (err, rows) => {
        if (err) {
            if (isJson)
                console.log(JSON.stringify({ error: err.message }));
            else
                console.error(err);
            db.close();
            return;
        }
        db.get('SELECT COUNT(*) as total FROM news', (err2, row2) => {
            if (isJson)
                console.log(JSON.stringify({ total: row2?.total || 0, byPublisher: rows }));
            else {
                console.log('📊 News Statistics:');
                console.log(`  Total news stored: ${row2?.total || 0}`);
                for (const r of rows) {
                    console.log(`  ${r.publisher}: ${r.count}`);
                }
            }
            db.close();
        });
    });
}
// Command: configure (interactive TUI for feeds)
async function cmdConfigure() {
    const config = loadConfig();
    const allCategories = Object.keys(config.feeds);
    const disabled = config.disabledFeeds || [];
    const choices = allCategories.map(cat => ({
        title: cat,
        value: cat,
        selected: !disabled.includes(cat) // Default to selected if not in disabled list
    }));
    const response = await (0, prompts_1.default)({
        type: 'multiselect',
        name: 'activeFeeds',
        message: 'Select the news categories you want to check (Space to toggle, Enter to confirm):',
        choices: choices,
        instructions: false, // Cleaner UI
        min: 0,
    });
    if (response.activeFeeds === undefined) {
        console.log('Configuration cancelled.');
        return;
    }
    // The disabled feeds are those NOT selected by the user
    const newDisabledFeeds = allCategories.filter(cat => !response.activeFeeds.includes(cat));
    config.disabledFeeds = newDisabledFeeds;
    (0, fs_1.writeFileSync)(configPath, JSON.stringify(config, null, 2));
    console.log(`\n✅ Configuration saved. Checking ${response.activeFeeds.length} out of ${allCategories.length} categories.`);
}
// Command: toggle (AI-friendly enable/disable)
async function cmdToggleCategories(categories, enable) {
    const config = loadConfig();
    const allCategories = Object.keys(config.feeds);
    let disabled = config.disabledFeeds || [];
    if (categories.length === 0) {
        console.log(`Please provide categories to ${enable ? 'enable' : 'disable'}.`);
        return;
    }
    for (const cat of categories) {
        // Basic case-insensitive matching
        const exactMatch = allCategories.find(c => c.toLowerCase() === cat.toLowerCase());
        if (!exactMatch) {
            console.log(`⚠️ Warning: Category "${cat}" not found in config feeds.`);
            continue;
        }
        if (enable) {
            disabled = disabled.filter(d => d !== exactMatch);
            console.log(`✅ Enabled: ${exactMatch}`);
        }
        else {
            if (!disabled.includes(exactMatch)) {
                disabled.push(exactMatch);
            }
            console.log(`❌ Disabled: ${exactMatch}`);
        }
    }
    config.disabledFeeds = disabled;
    (0, fs_1.writeFileSync)(configPath, JSON.stringify(config, null, 2));
    console.log(`\nChanges saved. ${allCategories.length - disabled.length} out of ${allCategories.length} categories active.`);
}
// Command: list (List all feeds and their status)
async function cmdListFeeds() {
    const config = loadConfig();
    const allCategories = Object.keys(config.feeds);
    const disabled = config.disabledFeeds || [];
    const statusList = allCategories.map(cat => ({
        category: cat,
        url: config.feeds[cat],
        enabled: !disabled.includes(cat)
    }));
    if (isJson) {
        console.log(JSON.stringify(statusList, null, 2));
    }
    else {
        console.log(`📰 Available Categories (${allCategories.length - disabled.length}/${allCategories.length} enabled):\n`);
        for (const item of statusList) {
            const checkbox = item.enabled ? '[x]' : '[ ]';
            console.log(`  ${checkbox} ${item.category}`);
        }
    }
}
// Router
async function main() {
    switch (command) {
        case 'check':
            await cmdCheck();
            break;
        case 'search':
            await cmdSearch(process.argv[3] || '');
            break;
        case 'history':
            await cmdSearch('');
            break;
        case 'stats':
            await cmdStats();
            break;
        case 'configure':
            await cmdConfigure();
            break;
        case 'enable':
            await cmdToggleCategories(process.argv.slice(3), true);
            break;
        case 'disable':
            await cmdToggleCategories(process.argv.slice(3), false);
            break;
        case 'list':
            await cmdListFeeds();
            break;
        default:
            console.log(`
yle-news - Yle news monitor

Usage: check-news.sh <command> [options]

Commands:
  check              Fetch new news
  search <query>    Search news (title, description, categories)
  history           Show recent news
  stats             Show statistics
  list              List all available categories and their status
  configure         Interactive TUI to toggle feed categories on/off
  enable <cat...>   Enable specific categories
  disable <cat...>  Disable specific categories

Options:
  --json             Output as JSON
  --category=Name    Filter by category
  --publisher=Name   Filter by publisher
  --days=N           Only show news from the last N days
  --hours=N          Only show news from the last N hours
  --limit=N          Limit results (default: 20)
`);
    }
}
if (require.main === module) {
    main().catch(console.error);
}
