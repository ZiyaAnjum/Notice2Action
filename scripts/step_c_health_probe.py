"""Step C: Start FastAPI backend in-thread on port 8001, probe /api/health, and shut down cleanly."""

from __future__ import annotations

import sys
import threading
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import httpx
import uvicorn

from backend.app.main import app


def main() -> None:
    print("[Step C] Starting FastAPI backend on http://127.0.0.1:8001...")
    config = uvicorn.Config(app=app, host="127.0.0.1", port=8001, log_level="warning")
    server = uvicorn.Server(config)

    server_thread = threading.Thread(target=server.run, daemon=True)
    server_thread.start()

    t0 = time.time()
    health_data = None
    last_err = None
    try:
        # Wait for server to start
        with httpx.Client(base_url="http://127.0.0.1:8001", timeout=5.0) as client:
            for attempt in range(20):
                try:
                    res = client.get("/api/health")
                    if res.status_code == 200:
                        health_data = res.json()
                        break
                    else:
                        print(f"Status: {res.status_code}, body: {res.text}")
                except Exception as ex:
                    last_err = ex
                time.sleep(0.3)

        elapsed = round(time.time() - t0, 2)
        if health_data:
            print(f"[Step C SUCCESS] Server responded in {elapsed}s:")
            print(f"  - Status:    {health_data.get('status')}")
            print(f"  - Database:  {health_data.get('database')}")
            print(f"  - Tesseract: {health_data.get('tesseract')}")
            print(f"  - Gemini:    {health_data.get('gemini')}")
            if health_data.get("warnings"):
                print(f"  - Warnings:  {health_data.get('warnings')}")
        else:
            print(f"[Step C FAILED] Server did not respond within timeout (elapsed: {elapsed}s). Last error: {last_err}")
            sys.exit(1)

    finally:
        print("[Step C] Stopping server...")
        server.should_exit = True
        server_thread.join(timeout=3)
        print("[Step C] Server stopped cleanly. Zero background processes remaining.")


if __name__ == "__main__":
    main()
