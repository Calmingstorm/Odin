.PHONY: run test lint fmt clean install dev

install:
	pip install -e .

dev:
	pip install -e ".[dev]"

run:
	python -m src

test:
	pytest -v

test-cov:
	pytest --cov=src --cov-report=term-missing

lint:
	ruff check src/ tests/

fmt:
	ruff format src/ tests/

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf .pytest_cache .ruff_cache .coverage htmlcov dist build *.egg-info
