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
curl -LO https://github.com/Calmingstorm/Odin/releases/latest/download/odin_4.3.0_amd64.deb
sudo apt install ./odin_4.3.0_amd64.deb
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

1. Open `http://127.0.0.1:3000/ui/`. For a remote host, run `ssh -L 3000:127.0.0.1:3000 user@odin-host` on your workstation and open that local URL, rather than publishing pending setup through a proxy.
2. Create a Discord application and bot in the [developer portal](https://discord.com/developers/applications), enable **Message Content Intent**, and enter its token in the WebUI. The token is persisted without being displayed. A valid token attaches the gateway immediately, without a service restart.
3. Complete provider authorization in the WebUI. Codex uses the existing device flow; it may be completed before or after the Discord token.
4. Review hosts, permissions and command workspace under **System**. To permit remote WebUI access, configure strong Web authentication and sign in as administrator. In **System → Config → Web listener exposure**, review the configured host and whether it is explicitly saved or supplied by the schema default, then authorize exposure and re-enter a current admin API token. Only an authenticated administrator with usable Web credentials can record or revoke this durable decision, including on a previously restricted legacy install. Setup completion or adding a Discord token never implies exposure consent.
5. Listener consent does not rebind or restart the running service. Arrange TLS and network access controls, then restart manually (`sudo systemctl restart odin`) to apply the saved `web.host`. Startup rechecks credentials; removing the last usable credential prevents widening even if earlier consent exists. A loopback `web.host` still stays loopback after consent.

For API operators, `POST /api/setup/listener` with a current raw admin API token in the `Authorization: Bearer` header and JSON `{"expose_beyond_loopback": true}` records widening after setup is complete; send `false` to record loopback restriction for the next start. Browser session IDs and query-string credentials cannot authorize either sensitive action. In **Web listener exposure**, re-enter the admin API token before saving the choice; it is used for this one request, cleared after submission, and never saved or substituted for your browser session. The server revalidates the supplied credential under the configuration transaction lock, so credential rotation, removal or demotion while the request waits cannot grant consent through an old identity. Its `restart_required: ["web.listener"]` response describes an operator action, not a scheduled restart. On completed installations, `/api/setup/status` reports durable listener intent separately from the current process's actual sockets; `/api/status` remains blocked until setup completes.

Setup changes to timezone, hosts and browser settings report an operator restart when changed.

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

**Listener behavior changes in this branch:** an existing installation with no
usable Web/API credential is restricted to loopback, even if its saved
`web.host` is broader. Localhost-only operation without an API token remains
supported. A Discord token is not Web authentication. Existing authenticated
installations retain their configured listener when migrating their legacy
state; adding credentials to a restricted installation does not itself grant
listener-widening consent. Use the authenticated consent procedure above and
an operator-controlled restart to widen it.

Source checkouts created with umask `0002` (directories `0775`) do not need
permission changes or an administrator trust-policy file to start. Group-write
permissions produce a diagnostic, not a startup refusal. Odin's newly created
initialization directory and published setup files remain private. Existing
symlinked data directories are supported; initialization state and lock files
themselves must not be symlinks. The implicit `.env` remains the file in the
working directory captured at startup, including when the YAML configuration
is elsewhere. An explicit environment-file argument or override takes precedence.

If a verified legacy installation has no initialization record but cannot
persist its migration, HTTP and its existing authenticated API remain usable.
Only operations requiring new durable setup or listener decisions are blocked
until storage is repaired. An unreadable, corrupt, mismatched or previously
observed record that disappears is still a recovery condition, not permission
to bypass setup. Corrupt dynamic credential storage never enables anonymous
access or disables otherwise-valid static credentials.
