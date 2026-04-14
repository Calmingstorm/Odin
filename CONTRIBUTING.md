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
