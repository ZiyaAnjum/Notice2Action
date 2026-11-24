import os
import time
import httpx
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("LLM_API_KEY")

test_models = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-omni-flash-preview",
]

for m in test_models:
    t0 = time.perf_counter()
    try:
        r = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent",
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": "Say 'OK'"}]}],
                "generationConfig": {"temperature": 0.0, "maxOutputTokens": 10},
            },
            timeout=8.0,
        )
        dur = time.perf_counter() - t0
        print(f"{m:30} -> {r.status_code} ({dur:.2f}s) text: {r.json().get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '').strip()[:20] if r.status_code == 200 else r.text[:60]}")
    except Exception as e:
        dur = time.perf_counter() - t0
        print(f"{m:30} -> EXCEPTION ({dur:.2f}s): {e}")
