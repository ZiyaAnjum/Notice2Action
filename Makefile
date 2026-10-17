.PHONY: help install run-backend run-frontend run-db test test-backend lint format clean

help:
	@echo "Available commands for Notice to Action:"
	@echo "  make install       Install python requirements and frontend npm packages"
	@echo "  make run-backend   Start the FastAPI backend server on port 8000"
	@echo "  make run-frontend  Start Vite development server on port 5173"
	@echo "  make run-db        Launch PostgreSQL using docker compose"
	@echo "  make test          Run full test suite (backend, extraction, validation)"
	@echo "  make lint          Run Python ruff linter and frontend ESLint"
	@echo "  make format        Format code using ruff and prettier"

install:
	python -m pip install -r backend/requirements.txt
	cd frontend && npm install

run-backend:
	python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

run-frontend:
	cd frontend && npm run dev

run-db:
	docker compose up -d

test:
	python -m pytest

lint:
	python -m ruff check backend extraction validation
	cd frontend && npm run lint

format:
	python -m ruff format backend extraction validation
	cd frontend && npm run format
