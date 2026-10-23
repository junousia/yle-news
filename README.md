# yle-news

Fetch, track and search news from 50+ [Yle](https://yle.fi/rss) RSS feeds with SQLite persistence (FTS5 search), from the command line or as an agent skill.

## Install

Requires Node.js 18+ (CI covers 18, 20 and 22).

```bash
git clone https://github.com/junousia/yle-news.git
cd yle-news
npm ci
node scripts/check-news.js
```

The compiled JavaScript is committed under `scripts/`; `npm run build` regenerates it from `src/`.
Runtime state (SQLite database, `state.json`) is created in the project directory and is git-ignored.
See `SKILL.md` for all commands and `references/config.json` for configuration.

## Use as an agent skill

`SKILL.md` makes this repo usable as a skill in [Hermes Agent](https://hermes-agent.nousresearch.com) and OpenClaw.
Clone it into the agent's skills directory (Hermes: `~/.hermes/skills/<category>/yle-news`,
OpenClaw: `<workspace>/skills/yle-news`) and run `npm ci` there. Run commands from the skill directory.

## License

MIT, see [LICENSE](LICENSE).
