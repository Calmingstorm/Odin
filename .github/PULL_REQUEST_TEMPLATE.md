## Summary

What changes and why, in a few sentences. Link the issue if there is one.

## Behaviour

- [ ] Normal-path behaviour is unchanged, or the change is described above
- [ ] New or changed tool parameters were tested with every field present, including empty strings and zero values
- [ ] No secrets, tokens, internal hostnames, or infrastructure paths in code, tests, or this description

## Verification

- [ ] `pytest -q` passes locally
- [ ] `ruff check src tests` passes
- [ ] `npm run check` passes and `ui/dist/` is committed if anything under `ui/` changed
- [ ] Characterization pins updated when the tool catalog, API routes, or config registry changed
