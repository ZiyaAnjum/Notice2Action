import os
import time
import httpx
from dotenv import load_dotenv
from extraction.schema_sanitizer import sanitize_gemini_schema
from extraction.llm_extractor import COMPACT_EXTRACTION_SCHEMA

load_dotenv()
api_key = os.getenv("LLM_API_KEY")

sanitized = sanitize_gemini_schema(COMPACT_EXTRACTION_SCHEMA)

url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"
headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}

payload_with_schema = {
    "system_instruction": {"parts": [{"text": "You are a JSON extractor."}]},
    "contents": [{"role": "user", "parts": [{"text": "Extract notice details."}]}],
    "generationConfig": {
        "temperature": 0.0,
        "responseMimeType": "application/json",
        "responseSchema": sanitized,
    },
}

t0 = time.perf_counter()
r1 = httpx.post(url, headers=headers, json=payload_with_schema, timeout=30.0)
print(f"WITH SCHEMA: status={r1.status_code} in {time.perf_counter() - t0:.2f}s")
if r1.status_code != 200:
    print(r1.text[:300])

payload_no_schema = {
    "system_instruction": {"parts": [{"text": "You are a JSON extractor."}]},
    "contents": [{"role": "user", "parts": [{"text": "Extract notice details."}]}],
    "generationConfig": {
        "temperature": 0.0,
        "responseMimeType": "application/json",
    },
}

t0 = time.perf_counter()
r2 = httpx.post(url, headers=headers, json=payload_no_schema, timeout=30.0)
print(f"WITHOUT SCHEMA: status={r2.status_code} in {time.perf_counter() - t0:.2f}s")
if r2.status_code != 200:
    print(r2.text[:300])
