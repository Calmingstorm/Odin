# Contributing to Odin

## Principles

- keep Odin separate from Heimdall
- do not reintroduce runtime secrets or live deployment data
- prefer extraction and decomposition over growing giant modules
- keep user-facing naming consistent with Odin
- preserve compatibility aliases only when they materially reduce migration risk

## Basic workflow

1. create a branch
2. make focused changes
3. run tests
4. keep docs/config examples aligned with reality
5. commit with clear messages

## Testing

```bash
python3 -m pytest -q tests
```

## WebUI development (since the Vite migration)

The UI keeps its plain ES-module + template-string structure — no SFCs —
but delivery is built with Vite:

- `npm ci` once, then `npm run dev` for a hot-reload dev server on :5173
  that proxies `/api` to a locally running bot on :3002.
- `npm run check:templates` validates every Vue template string strictly
  (the runtime compiler silently tolerates malformed templates; CI does not).
- `npm run build` writes `ui/dist/`, which is **committed** — production
  serves the built output and a `.deb` install needs no Node. CI fails if
  `ui/dist` drifts from source, so always build before committing UI changes.
- CSP note: `'unsafe-eval'` remains in script-src only because templates are
  runtime-compiled strings. Removing it requires migrating pages to
  precompiled SFC templates (tracked follow-up).
