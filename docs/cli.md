# Server and API-client commands

`odin` is the **API client on every install type**, including Python wheels,
editable/source installs and Debian. `odin-client` is an explicit client alias.
Use these command roles on every supported installation:

- `odin-server [config-file]` starts the Odin server. It does not send a prompt
  to an already running instance. Debian's wrapper selects the installation
  working directory; Python console scripts use the configured startup paths.
- `odin-client "check disk usage"` sends a prompt to the HTTP execution API.
  The default URL is `http://localhost:3000`; set `ODIN_URL` or `--url` for a
  different listener. Authentication uses `ODIN_API_TOKEN` or `--token`.
  Prefer the environment variable so credentials are not placed in shell
  history or process arguments. `--json` emits the response object and still
  exits nonzero when execution fails. Standard input may supply the prompt.

The names are installed by Python wheels/editable installs and Debian.
Their roles do not depend on how Odin was installed.

## Safe upgrade from the legacy `odin` command

Previously Python/source installs used `odin` for the server. Update service
definitions, shell aliases and server automation to `odin-server`.
An old server invocation through `odin`, including a config-file argument or
`-c`, `--config` or `--env-file`, is refused with a nonzero exit and a message
that the server command is now `odin-server`; **no prompt is sent**. Config-file
arguments include existing files and single path-shaped `.yml`/`.yaml` names.
A normal prose prompt mentioning a YAML filename is not a config argument.
The project never starts the server using its API-client command, and does not
silently rewrite operator-owned scripts or units.

`python -m src` remains an explicit server invocation. `--help` for either
explicit command is local and does not contact a running instance.
