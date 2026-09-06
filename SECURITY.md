# Security policy

Odin is an execution agent: a deployment can run shell commands on the hosts it is granted, change repositories, and operate services. Treat it as an administrative service and read the [safety and access control](README.md#safety-and-access-control) section and [`docs/security.md`](docs/security.md) before exposing it beyond a controlled network.

## Supported versions

Only the latest release on the `master` branch receives fixes. Upgrade before reporting.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

- Use GitHub's private vulnerability reporting on this repository: **Security → Report a vulnerability**. It is enabled, and reports are visible only to the maintainer.

Include the version, the configuration that matters (provider, permission tier, host access policy), and a reproduction that uses fake credentials and harmless commands. You will get an acknowledgement within a few days; fixes ship as a patch release with the advisory credited to you unless you prefer otherwise.

## Scope notes

- Skills execute in the Odin process as trusted plugins; the AST validation and tool allowlists are guard rails, not a sandbox.
- The Debian package grants the `odin` service account passwordless sudo by default because host administration is the primary use case. Restrict `/etc/sudoers.d/99-odin-passwordless` for production deployments.
- The tracked configuration template sets the default permission tier to `admin` and binds the WebUI to all interfaces with authentication disabled until an API token is configured. These are deployment choices to review, not defects.
