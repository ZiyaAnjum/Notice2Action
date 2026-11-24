import os
import sys
sys.path.insert(0, ".")
import json
import httpx
from dotenv import load_dotenv
from extraction.schema_sanitizer import sanitize_gemini_schema
from extraction.llm_extractor import COMPACT_EXTRACTION_SCHEMA

load_dotenv()

api_key = os.getenv("LLM_API_KEY")
primary_model = os.getenv("LLM_MODEL", "gemini-1.5-flash")
fallback_model = os.getenv("LLM_FALLBACK_MODEL", "gemini-1.5-flash")

print(f"API Key present: {bool(api_key)}, len: {len(api_key) if api_key else 0}")
print(f"Primary model in .env: {primary_model}")
print(f"Fallback model in .env: {fallback_model}")

sanitized_schema = sanitize_gemini_schema(COMPACT_EXTRACTION_SCHEMA)
print("\nTesting Gemini API call with sanitized schema...")

headers = {
    "Content-Type": "application/json",
    "x-goog-api-key": api_key,
}

payload = {
    "system_instruction": {"parts": [{"text": "You are a notice extractor. Output JSON adhering to schema."}]},
    "contents": [{"role": "user", "parts": [{"text": "[PAGE 1]\nElectricity Bill. BESCOM. Due date: 25-11-2026. Amount: Rs 1500."}]}],
    "generationConfig": {
        "temperature": 0.0,
        "responseMimeType": "application/json",
        "responseSchema": sanitized_schema,
    },
}

models_to_test = [primary_model, fallback_model, "gemini-1.5-flash", "gemini-2.0-flash"]
seen = set()

for model in models_to_test:
    if model in seen:
        continue
    seen.add(model)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    print(f"\n--- Testing model: {model} ---")
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, headers=headers, json=payload)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print("SUCCESS!")
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            print(f"Extracted response: {text[:200]}...")
        else:
            print(f"Error text: {resp.text[:300]}")
    except Exception as e:
        print(f"Exception: {e}")
