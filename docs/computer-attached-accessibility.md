# Attached X11 native field targeting checkpoint

Implementation only, statically checked. No live display, native action, pytest,
new test suite, deployment or restart was used to validate this checkpoint.

## Native path

The one-shot capture worker optionally loads GI/AT-SPI, discovers an existing
local Unix accessibility bus from the explicitly attached X server's AT_SPI_BUS
property and checks for an existing registry. It does not enable accessibility,
change session settings, discover another user's session bus, or elevate itself.
The bus connection's reported PID and UID must match the independently admitted
XRes application process. Missing GI, bus, registry, ownership proof or native
identity makes accessibility unavailable, not a keyboard/clipboard fallback.

Each delivered view contains opaque observation-local handles and public
`node_identity`, `root_identity`, `ancestor_identity`, `focused` and
`bounds_space: source` metadata. Attached identities bind the actual bus GUID,
unique sender, object path and XRes process PID/UID/start time. Native identifiers
remain private. Bounds are source-local, and only wholly visible-in-crop nodes
are published. Traversal is bounded to 128 nodes, depth six, with a one-second
capture-accessibility budget and the existing outer capture process deadline.

The controller requires native identity fields during field-handle reconciliation,
in addition to exact metadata equality. The isolated worker now retains proxies
and stable random native-node IDs (bounded to 2048 for its lifetime); it does not
reconcile identical replacement widgets by name and rectangle alone.

`replace_field` crosses the existing backend source/consent/modal checks with a
private, capture-owned reference. The guardian resolves exactly the original bus
object and validates root identity, full fingerprints, ancestry, text and native
scope before a single EditableText call. The existing helper identity gate,
device identity, physical-input overlap, scope checks, fixed lease and cleanup
remain in force. The semantic call is performed in the guardian, not by sending
synthetic keystrokes. Its dispatch intent is recorded before the potentially
effectful native RPC; uncertain outcomes are not replayed.

After the helper is fenced and owned input released, readback queries the same
GI node, not a fresh search result. Only full text equality establishes the
requested effect. Missing or late readback leaves effect verification unavailable
without erasing the acknowledged input. Post-action pixels continue through the
controller's ordinary capture/delivery path; a semantic receipt is not permission
to act on an unseen view.

## Explicit limits

- Only replacement of readable, complete, non-password editable text of at most
  512 characters is exposed as an attached native operation. Empty replacement
  is supported. Generic native invoke/select/value actions are not advertised.
- No accessibility-bus property fallback or automatic desktop provisioning.
  Applications not exporting an unambiguous active-window root are unavailable.
- The initial field action retains existing raster freshness requirements;
  changing text, ancestry, focus, scope or geometry before dispatch rejects it.
- Slow accessibility providers can exhaust the bounded lease before any write;
  an RPC whose reply is lost is uncertain, not safely retryable.
- X11/AT-SPI are cooperative protocols. They do not provide isolation from a
  malicious same-session client, atomic focus-and-write transactions, or proof
  against a provider deliberately recycling the exact same D-Bus object path.
- This checkpoint is not runtime certification. GUI validation and the deferred
  full test gate remain necessary before claiming attached native support works
  on any particular desktop/application.
