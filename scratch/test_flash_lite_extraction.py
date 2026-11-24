import os
import sys
import time
import json
from dotenv import load_dotenv

sys.path.insert(0, ".")
load_dotenv()

from extraction.llm_client import GeminiLLMClient
from extraction.llm_extractor import COMPACT_EXTRACTION_SCHEMA

api_key = os.getenv("LLM_API_KEY")
print(f"Loaded key: {'***' + api_key[-6:] if api_key else 'None'}")

client = GeminiLLMClient(
    model="gemini-flash-lite-latest",
    fallback_model="gemini-3.5-flash-lite",
    timeout_seconds=30.0,
)

system_prompt = "You are a legal notice extraction AI. Extract structured JSON strictly adhering to schema."
user_prompt = "Document: BESCOM Electricity Notice. Account ID: 102938475. Amount Due: Rs 2,450. Due Date: 2026-12-15. Disconnection warning on non-payment within 15 days."

t0 = time.perf_counter()
try:
    res = client.generate_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        response_schema=COMPACT_EXTRACTION_SCHEMA,
    )
    dur = time.perf_counter() - t0
    print(f"Extraction succeeded in {dur:.2f}s!")
    data = json.loads(res)
    print("Parsed JSON keys:", list(data.keys()))
    print("Headline:", data.get("headline"))
    print("Deadlines:", data.get("deadlines"))
except Exception as e:
    dur = time.perf_counter() - t0
    print(f"Extraction failed after {dur:.2f}s: {e}")
