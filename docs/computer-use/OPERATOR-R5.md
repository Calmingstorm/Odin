# R5 operator lifecycle view

The `ui/js/pages/computer.js` component exposes explicit administrator enable and
disable requests through authenticated `POST /api/computer/enabled` with exactly
`{enabled: boolean}`. It follows each successful acknowledgement with a status
read; the acknowledgement alone does not establish readiness. Controls appear
only after a successful administrator-gated status response and disappear on
authorization failure or credential change. Server authorization remains the
security boundary, not button visibility.

The status contract is `GET /api/computer`, including when disabled. In addition
to existing session fields the view consumes `enabled`, `configured_enabled`,
`runtime_enabled`, `generation`, `restart_required` (boolean or setting-name
array), and optional `backend.platform`, `backend.environment`, and
`backend.input_supported`. Missing values are unknown, never inferred as ready.
Session startup checks capabilities; enabling neither starts a session nor makes
unavailable input available. Restart-required changes are not advertised as live
and the page does not restart Odin.

Stop and pause remain independent network requests while observation or a
lifecycle change is pending. They invalidate earlier UI responses and displayed
evidence. They do not claim to cancel an in-flight enable transaction; refreshed
server status is authoritative. Session or runtime-generation changes invalidate
displayed evidence and prepared exports. Opening, refreshing and toggling never
request a screenshot or fetch evidence. Observation and saved-file downloads
remain explicit authenticated actions. The page provides no mouse/keyboard input.

## Validation boundary

`node scripts/check-computer-browser.mjs` exercises the real Vue component in a
disposable headless Chromium browser against a loopback Vite harness and mocked,
Bearer-authenticated API routes. It checks enable/disable readback, lifecycle
fields, unknown and unavailable capability text, explicit capture and exports,
independent stop/pause during pending requests, stale-response rejection,
generation invalidation, and authorization denial. This is UI behavior evidence,
not evidence of real backend startup, input support, or a successful GUI task.
No live WebUI, active workstation display, deployment, or service restart is
involved. The parent task owns rebuilding distribution artifacts.
