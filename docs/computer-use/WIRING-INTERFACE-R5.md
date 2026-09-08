# Production wiring interface R5

Implemented interfaces, no activation. Parent facade constructor accepted:
`ComputerIntegration(bot, *, controller=None, settings=None)`. Manager passes boot
settings copy, pinned across toggles. Owned store closes only after verified cleanup.

Final schema: environment, platform, display local :N, xauthority absolute optional,
monitor_names unique bounded strings. Matches X11AttachedBackend(display_name,
xauthority, monitor_names, app_profile). No input eligibility flag. Wayland refused.

Production manager exists at src/computer/manager.py. Composition/client/catalog
wiring and route registration are implemented. Operator APIs implemented by GUI
agent; parent integration calls controller.operator_session, not session.

Web revocation hook (parent integration requested): call optional
`bot.computer_authorize_context(context)` inside `_authorize`, fail if false.
Manager maps ONLY authenticated foreground web context to live session validator,
not user-supplied session ID. Operator calls have fresh API auth, no stored grant.
This hook protects awaited controller boundaries as well as foreground dispatch.
