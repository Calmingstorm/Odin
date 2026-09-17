# Discord connection lifecycle

The onboarding service can run HTTP/bootstrap without a Discord token. An
explicit gateway detach also leaves HTTP available. Neither is a gateway
failure, and neither requests process termination.

Once a gateway is attached, discord.py continues to own ordinary reconnects
and backoff. If its owned gateway task unexpectedly raises, returns, or is
cancelled, Odin clears readiness and shuts down with exit code 1. The existing
process supervisor can then restart the service. This restores terminal
failure recovery rather than silently leaving a configured bot HTTP-only;
it does not add a second reconnect policy. The same contract applies to a
gateway first attached through onboarding after tokenless startup. Intentional
retirement fences the old generation before cancelling it, so its completion
cannot terminate a replacement gateway or the HTTP bootstrap service.

A first login uses discord.py's public API and does not require the private
reattachment adapter's compatibility check. A version/layout mismatch remains
visible in connection status. Retirement can publicly close and cancel that
gateway, but it refuses private state reset and any subsequent attachment in
that process. Restart with the qualified dependency before reattaching. The
dependency pin is unchanged.

Global slash commands are published after attempting legacy guild cleanup,
even if one or all guild cleanups fail. Failed scopes remain retryable on later
ready/resume/join events; successful scopes are not repeatedly published. A
guild that refuses cleanup can temporarily retain duplicate legacy commands.
That local cosmetic risk no longer disables commands in every guild and bot
DM.

Message sends retry bounded `aiohttp.ClientConnectorError` failures because
they establish that the connection failed before transmission. Generic
`ClientOSError`, connection resets, read timeouts, and other ambiguous transport
errors are not proof of non-delivery and remain non-retryable. This avoids
duplicating replies that Discord may already have accepted.
