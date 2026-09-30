# Server and API-client commands

Use the explicit command names on every supported installation:

- `odin-server [config-file]` starts the Odin server. It does not send a prompt
  to an already running instance. Debian's wrapper selects the installation
  working directory; Python console scripts use the configured startup paths.
- `odin-client "check disk usage"` sends a prompt to the HTTP execution API.
  The default URL is `http://localhost:3000`; set `ODIN_URL` or `--url` for a
  different listener. Authentication uses `ODIN_API_TOKEN` or `--token`.
  Prefer the environment variable so credentials are not placed in shell
  history or process arguments. `--json` emits the response object and still
  exits nonzero when execution fails. Standard input may supply the prompt.

Both explicit names are installed by Python wheels/editable installs and the
Debian package. Their roles do not depend on how Odin was installed.

## Safe upgrade from the legacy `odin` command

The historical `odin` alias is preserved rather than silently reversing its
behavior during upgrade:

- On Python installations, `odin` still starts the server.
- On Debian installations, `odin` still runs the API client.

Update service definitions, shell aliases and server automation to
`odin-server`. Update prompt-sending scripts to `odin-client`. Existing
commands keep working while this migration is made; no package upgrade edits
operator-owned units or scripts to change their meaning. New automation should
never rely on the installation-dependent legacy alias.

`python -m src` remains an explicit server invocation. `--help` for either
explicit command is local and does not contact a running instance.
