.PHONY: help test test-fast coverage lint format api ingest reimport mobile mobile-test mobile-lint perf clean

help:
	@echo "make test         - run the full backend test suite"
	@echo "make test-fast    - run backend tests without coverage (quick)"
	@echo "make coverage     - run backend tests with coverage report"
	@echo "make lint         - run ruff on backend/"
	@echo "make format       - run ruff-format on backend/"
	@echo "make api          - run the FastAPI dev server"
	@echo "make ingest       - build the SQLite DB from map.osm"
	@echo "make reimport     - merge map.osm into the DB (merge-safe)"
	@echo "make mobile       - run the Expo dev server (dev client)"
	@echo "make mobile-test  - run mobile unit tests"
	@echo "make mobile-lint  - run ESLint on mobile/"
	@echo "make perf         - run the API benchmark (Phase 17)"
	@echo "make clean        - remove caches"

test:
	cd backend && python -m pytest

test-fast:
	cd backend && python -m pytest -x --no-header -q

coverage:
	cd backend && python -m pytest --cov=core --cov=api --cov=pipeline --cov-report=term-missing

lint:
	cd backend && ruff check .

format:
	cd backend && ruff format .

api:
	cd backend && python -m uvicorn backend.api.main:app --reload --host 0.0.0.0 --port 8000

ingest:
	python -m backend.pipeline.ingest

reimport:
	python -m backend.pipeline.reimport

mobile:
	cd mobile && npx expo start --dev-client

mobile-test:
	cd mobile && npx jest

mobile-lint:
	cd mobile && npx eslint .

perf:
	@echo "Not implemented until Phase 17."

clean:
	@echo "Cleaning caches..."
	-find . -type d -name "__pycache__" -exec rm -rf {} +
	-find . -type d -name ".pytest_cache" -exec rm -rf {} +
	-find . -type d -name ".ruff_cache" -exec rm -rf {} +
	@echo "Done."