# Native image model defaults and upgrades

The shipped native image pairing is `gpt-6-astra` (outer Responses tool carrier)
and `gpt-image-2.5-flare` (image tool model). These are independent of the chat
model. This change does not change backend routing, enablement or timeouts.

## Following versus pinning

An absent `image.openai.outer_model` or `image.openai.image_model` leaf follows
that release's schema default. An explicit value pins that leaf. The shipped
`config.yml` shows commented examples: leaving them commented follows defaults;
uncommenting pins. The setup wizard also leaves these leaves absent.

The WebUI reports effective value, shipped default and follow/pin status for
each leaf. Follow-defaults deletes the selected leaf; Pin-current explicitly
writes its current effective value. Neither action replaces the image section.
Provenance/status metadata is not configuration and is never persisted in YAML.
An unrelated save must not convert an absent model into a pin.

## One-time first-upgrade exception

The first upgrade independently changes only exact literal old shipped values:

* `image.openai.image_model: gpt-image-2` becomes `gpt-image-2.5-flare`.
* `image.openai.outer_model: gpt-5.5` becomes `gpt-6-astra`.

**A deliberate pin equal to an old shipped default is indistinguishable from an
inherited old value and WILL be upgraded once.** This is an intentional blanket
first-upgrade tradeoff, not intent detection. Any other value is preserved. Absent
leaves stay absent. Environment placeholders are not resolved to infer intent;
secrets, anchors and unrelated configuration are not expanded or rewritten.

An identity-bound migration marker records the completed migration so later
loads, unrelated saves and subsequent upgrades never re-clobber an operator's
choice. After successful migration, explicitly pinning an old model is allowed
and must remain pinned on later loads. Do not delete the marker to troubleshoot:
doing so may make the first-upgrade rule eligible again.

## Installation paths

Source/manual checkouts use the repository template. Debian packaging maps it
to `/opt/odin/config.yml.default`; the noninteractive post-install hook copies it
to `/etc/odin/config.yml` only when no operator config exists. Package upgrades
preserve the existing config, with the application symlink pointing to it.
WebUI setup writes its existing minimal wizard config without image-model leaves.
All paths then use the common application config loader and migration logic.
There is no model rewrite in the self-updater or the OpenAI backend.

## Failures and rollback

Back up the operator YAML and migration state together before rollout. A failed
persistence attempt must be reported as a failure, not a successful durable
adoption; do not claim the next restart will retain a change that was not saved.
Investigate write permissions and reported migration errors before retrying.
Never mark an unsuccessful rewrite complete. Retrying must preserve custom pins
and unrelated settings and be idempotent after a successful migration.

Rolling back code changes the effective defaults for absent leaves to the older
release's defaults; explicit new pins remain explicit and are not automatically
downgraded. Restore a consistent config/state backup if restoring the whole
installation, or deliberately choose compatible pins. Reapplying the upgrade to
pre-migration state can run the one-time old-value substitution again.

## Release evidence

Run `tests/test_image_default_installation.py` for template, wizard and package
copy/preserve contracts. Set `ODIN_IMAGE_DEFAULT_DEB` to an actual built package
to additionally inspect its payload and execute its config-install block inside
a temporary root (never against the live installation). These checks do not
claim a full dependency installation or successful image generation. The final
integration gate must also load fresh/source/wizard/upgraded configurations via
the common loader, exercise the intent/failure matrix, and generate a decodable
image through Odin with actual Discord delivery on the new pairing. HTTP 200 or
an unpacked package alone is not that gate.
