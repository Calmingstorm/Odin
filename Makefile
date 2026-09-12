.PHONY: run test test-cov lint fmt clean install dev

PYTHON ?= python
# Verification policy and local/CI usage: docs/testing.md.
# Two concurrent CI jobs: six workers each, never CPU-count-based auto sizing.
TEST_ARGS = -q -n 6 --dist loadgroup --durations=25
export OMP_NUM_THREADS = 1
export OPENBLAS_NUM_THREADS = 1
export MKL_NUM_THREADS = 1

install:
	pip install -e .

dev:
	pip install -e ".[dev]"

run:
	python -m src

test:
	$(PYTHON) -m pytest $(TEST_ARGS)

test-cov:
	COVERAGE_CORE=sysmon $(PYTHON) scripts/ci/coverage_gate.py

lint:
	ruff check src/ tests/

fmt:
	ruff format src/ tests/

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf .pytest_cache .ruff_cache .coverage htmlcov dist build *.egg-info
