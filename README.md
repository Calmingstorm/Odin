# Odin

Odin is a Discord moderation and utility bot with a web dashboard, LLM integration, and extensible tool/skill system.

## Features

- **Moderation**: ban, kick, mute, warn, purge with full audit logging
- **Auto-moderation**: spam filter, link filter, word filter
- **Utility**: server info, user info, reminders, fun commands
- **Web Dashboard**: real-time admin UI with session management
- **LLM Integration**: OpenAI Codex-backed conversation with tool use
- **Skills**: user-created Python skill modules (CRUD, versioning, execution)
- **Browser Automation**: headless Chromium via Browserless sidecar
- **Voice**: optional voice channel support with transcription
- **Monitoring**: health checks, disk/memory/service monitoring

## Project Structure

```
.
├── src/
│   ├── __main__.py          # Entry point
│   ├── config/              # OdinConfig + YAML schema
│   ├── constants.py         # Branding, colors, limits
│   ├── discord/
│   │   ├── client.py        # OdinBot class
│   │   ├── cogs/            # Command modules
│   │   ├── helpers/         # Embeds, permissions, pagination
│   │   └── views/           # Interactive UI components
│   ├── web/                 # aiohttp dashboard + API
│   ├── tools/               # Tool registry + executor
│   ├── llm/                 # LLM client + circuit breaker
│   ├── search/              # FTS5 + vector search
│   └── ...
├── ui/                      # Frontend dashboard assets
├── tests/
├── scripts/
├── Dockerfile
├── docker-compose.yml
├── config.yml
└── pyproject.toml
```

## Quick Start

1. Copy `.env.example` to `.env` and fill in your Discord bot token
2. Install dependencies:
   ```bash
   pip install -e ".[dev]"
   ```
3. Run the bot:
   ```bash
   python -m src
   ```

## Docker

```bash
docker compose up -d
```

## Running Tests

```bash
python3 -m pytest -q tests
```

## Configuration

- `config.yml` — main configuration (Discord, tools, LLM, web dashboard, etc.)
- `.env` — secrets (bot token, database URL, OAuth credentials)
- See `.env.example` for required environment variables.

## License

MIT
