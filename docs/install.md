# Install

Odin ships as an amd64 Debian package and as a source checkout. The package path is the one to use for a long-running service; the source path is for development.

::: warning Configure API authentication before starting or exposing Odin
With no API token configured (empty `web.api_token`, no `web.api_tokens` entries,
and no managed tokens), the general API authentication gate is disabled. Routes
relying on that gate are unauthenticated. The operator must set a strong, private
`web.api_token` to secure the installation. Bind `web.host` to `127.0.0.1` unless
deliberately exposing it behind TLS and access controls. This applies to both
package and source setup, especially before enabling desktop observation and
stored evidence. Computer routes additionally require an authenticated admin
identity; those separate checks do not secure the rest of a tokenless installation.
The template also defaults permissions to `admin`, and the package grants the
`odin` account passwordless sudo. Review these before starting the service.
:::

## Debian or Ubuntu package

```bash
curl -LO https://github.com/Calmingstorm/Odin/releases/latest/download/odin_3.98.0_amd64.deb
sudo apt install ./odin_3.98.0_amd64.deb
```

The package installs a dedicated `odin` system user, a Python virtual environment with dependencies, the configuration files, and a systemd service. The service is enabled but left stopped until it is configured.

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

1. Create a Discord application and bot in the [developer portal](https://discord.com/developers/applications) and enable **Message Content Intent**.
2. Put the token in the environment file — never in YAML:

   ```bash
   sudoedit /etc/odin/.env
   # DISCORD_TOKEN=...
   ```

3. Authenticate a model backend. Codex uses the ChatGPT subscription OAuth flow; Kimi and Ollama can be configured later from the WebUI:

   ```bash
   sudo -u odin /opt/odin/.venv/bin/python /opt/odin/scripts/codex_login.py \
     --credentials-path /var/lib/odin/codex_auth.json --device
   ```

4. Review hosts, permissions, the command workspace, and the WebUI binding and API token:

   ```bash
   sudoedit /etc/odin/config.yml
   ```

5. Start the service and watch it come up:

   ```bash
   sudo systemctl start odin
   sudo journalctl -u odin -f
   ```

The WebUI listens on `web.port`, which defaults to `3000`. Register the hosts Odin may reach under **System → Hosts**, then ask it for something harmless in a channel it can see.

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
