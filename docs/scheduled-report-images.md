# Images in scheduled paginated reports

The `paginated_embed_v1` producer contract accepts an optional `image_url`
string on each page. Existing text-only reports and persisted projections remain
unchanged. The renderer passes the validated URL to Discord's embed image field;
Odin does not fetch the URL, read a local file, or execute another command.

Image URLs must be absolute HTTPS URLs, without credentials, whitespace or
control characters, and at most 512 characters after URL normalization.
Rendered URLs receive the same secret scrubbing as structured links. Local
paths, `attachment://`, `file://`, HTTP and inline data URLs are not supported.
Producers must publish an image where Discord can retrieve it without
authentication. An accepted URL is not proof that Discord successfully fetched
or displayed the image.

Use immutable, content-addressed PNG URLs for graphs. This prevents pagination
or Discord caching from showing tomorrow's chart in today's report. Keep each
image available for at least the useful lifetime of its Discord message.
Pagination persists the normalized URL and redraws the saved embed without
rerunning the producer. Navigating to a page without an image clears the old
embed's image as part of replacing the embed.

## Killstream integration order

The killstream producer lives in `Calmingstorm/eve-intel-toy`, not Odin. Its
monthly-loss graph is an optional fifth page containing a hosted PNG URL. The
Odin renderer must be deployed externally with Aaron's authorization **before**
enabling the producer's chart flags on the daily schedule. Older renderers
intentionally reject unknown page keys and cannot consume `image_url`.

Neither implementing this feature nor running its isolated tests authorizes an
Odin deployment or service restart. Keep the existing schedule command until
the compatible renderer is confirmed live.
