# Install

The WebUI-first bootstrap flow below describes this branch's upcoming release.
Published v3.98.0 packages still require the earlier manual configuration and start procedure.

Odin ships as an amd64 Debian package and as a source checkout. The package path is for a long-running service; the source path is for development.

::: warning Bootstrap is local only
A fresh package install starts a pending bootstrap service bound effectively to loopback, even if the configured host is broader. Complete setup at `http://127.0.0.1:3000`, or through an SSH tunnel to that address. Do not expose the bootstrap UI through a reverse proxy or public listener. Entering a Discord token does not authenticate the WebUI or widen its listener.

After setup, configure a strong private `web.api_token` before deliberately exposing Odin beyond loopback. Computer routes have separate admin checks; those checks do not secure the rest of a tokenless installation. The package also grants the `odin` account passwordless sudo. Review the [security model](/security).
:::

## Debian or Ubuntu package

```bash
curl -LO https://github.com/Calmingstorm/Odin/releases/latest/download/odin_3.98.0_amd64.deb
sudo apt install ./odin_3.98.0_amd64.deb
```

The package installs a dedicated `odin` system user, a Python virtual environment with dependencies, configuration files, and a systemd service. A fresh install starts a restricted loopback bootstrap service so setup happens in the WebUI. Upgrades preserve configuration and restart Odin only when it was already running.

| Purpose | Path |
|---|---|
| Application | `/opt/odin` |
| Configuration | `/etc/odin/config.yml` |
| Environment file | `/etc/odin/.env` |
| Persistent data | `/var/lib/odin` |
| Local command workspace | `/var/lib/odin-workspace` |
| Logs | `/var/log/odin` |
| Systemd unit | `/usr/lib/systemd/system/odin.service` |

## First-time setup

1. Open `http://127.0.0.1:3000`. For a remote host, forward that loopback port over SSH rather than publishing it through a proxy.
2. Create a Discord application and bot in the [developer portal](https://discord.com/developers/applications), enable **Message Content Intent**, and enter its token in the WebUI. The token is persisted without being displayed. A valid token attaches the gateway immediately, without a service restart.
3. Complete provider authorization in the WebUI. Codex uses the existing device flow; it may be completed before or after the Discord token.
4. Review hosts, permissions, command workspace, and eventual WebUI exposure under **System**. Add Web authentication before widening the listener.

Bootstrap is not a permanent Discord-less mode: schedules and normal Discord-backed work remain unavailable until Odin is connected. An invalid token or unfinished provider authorization stays visible as an actionable setup state. Watch startup with `sudo journalctl -u odin -f` when diagnosing a failed attachment.

The WebUI listens on `web.port`, which defaults to `3000`. Once connected, register the hosts Odin may reach under **System → Hosts**, then ask it for something harmless in a channel it can see.

Read the [security model](/security) for the remaining deployment controls.

## From source

Python 3.11 or newer is required; CI runs on 3.12.

```bash
git clone https://github.com/Calmingstorm/Odin.git
cd Odin
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
# optional browser tools
pip install -e ".[browser]" && python -m playwright install chromium
cp .env.example .env
# set DISCORD_TOKEN in .env; set web.api_token and web.host in config.yml before starting
mkdir -p ~/.local/share/odin-workspace && chmod 0700 ~/.local/share/odin-workspace
# set tools.local_working_dir to that absolute path in config.yml
python -m src
```

Local shell tools refuse to run without a private workspace directory outside the checkout, owned by the running user and mode `0700`.

## Upgrading

Package installs upgrade through `apt` with the next release's package; configuration and data are preserved and the service restarts only if it was running. Git checkouts can use the WebUI's **System → Update** page, which fetches tags, fast-forwards `master`, reinstalls dependencies when needed, and restarts in place.
