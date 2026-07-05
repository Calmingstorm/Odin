"""Characterization suite for the client.py decomposition campaign (RFC-001 P0).

These tests pin CURRENT behavior of src/discord/client.py — they must pass
against the unmodified baseline and stay green through every extraction
phase. If one fails after a refactor, the refactor changed behavior.

Rules (RFC-001 §8):
- No test here may be weakened or deleted during the campaign without an
  explicit note in the PR body of the phase doing it.
- Where current behavior is surprising, it is pinned AS-IS with a comment;
  fixes are separate issues, never folded into a move phase.
"""
