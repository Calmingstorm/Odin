"""Private worker package; never import the controller-side adapter here.

The worker/supervisor also import this as top-level ``runtime`` when launched as
files inside the sandbox. The adapter belongs to ``src.computer`` and imports
its neutral contracts; eagerly importing it here breaks that standalone path.
Controller callers import ``runtime.backend`` explicitly.
"""
