import os
import sys
import time
import json
from pathlib import Path
from dotenv import load_dotenv

sys.path.insert(0, ".")
load_dotenv()
os.environ["PIPELINE_TOTAL_TIMEOUT_SEC"] = "120.0"

from extraction.llm_client import GeminiLLMClient, get_llm_client
from extraction.pipeline import process_notice
from backend.app.services.image_preprocessor import (
    normalize_and_strip_metadata,
    enhance_image_for_ocr,
    create_pdf_from_images,
)

print("=================================================================")
print("LIVE REAL (UNMOCKED) GEMINI EXTRACTION TEST")
print("=================================================================")
api_key = os.getenv("LLM_API_KEY")
print(f"Loaded LLM_API_KEY: {'***' + api_key[-6:] if api_key else 'NONE'}")
print(f"Primary model: {os.getenv('LLM_MODEL')}")
print(f"Fallback model: {os.getenv('LLM_FALLBACK_MODEL')}")

client = GeminiLLMClient(
    model="gemini-3.5-flash",
    fallback_model="gemini-3.5-flash-lite",
    timeout_seconds=45.0,
)

# -----------------------------------------------------------------
# 1. Fallback model verification test
# -----------------------------------------------------------------
print("\n" + "=" * 60)
print("TEST 1: Fallback Model Path Verification")
print("=" * 60)
fb_test_client = GeminiLLMClient(
    model="gemini-invalid-model-404-test",
    fallback_model="gemini-3.5-flash",
    timeout_seconds=45.0,
)
t0 = time.perf_counter()
try:
    fb_res = fb_test_client.generate_json(
        system_prompt="You are a JSON assistant. Output valid JSON.",
        user_prompt="Output a simple JSON object: {\"status\": \"ok\", \"fallback_verified\": true}",
    )
    fb_dur = time.perf_counter() - t0
    print(f"Fallback test succeeded in {fb_dur:.2f}s!")
    print(f"Fallback output: {fb_res}")
except Exception as e:
    print(f"Fallback test failed: {e}")

# -----------------------------------------------------------------
# 2. Sample 1: Digital PDF (digital_electricity_notice.pdf)
# -----------------------------------------------------------------
print("\n" + "=" * 60)
print("TEST 2: Digital PDF - samples/digital_electricity_notice.pdf")
print("=" * 60)
sample_digital = Path("samples/digital_electricity_notice.pdf")
t0 = time.perf_counter()
res_digital = process_notice(sample_digital, client=client)
dur_digital = time.perf_counter() - t0

print(f"Status: {res_digital.get('status')}")
print(f"Category: {res_digital.get('category')}")
print(f"Execution time: {dur_digital:.2f}s")
if res_digital.get("result"):
    headline = res_digital["result"].get("headline") or {}
    print(f"Title: {headline.get('one_line_summary') or headline.get('title')}")
    print(f"Issuer: {headline.get('source_organisation')}")
    print(f"Amount due: {headline.get('amount_due')}")
    print(f"Deadlines found: {len(res_digital['result'].get('deadlines', []))}")
    print(f"Action steps: {len(res_digital['result'].get('action_steps', []))}")
    print(f"Summary: {res_digital['result'].get('plain_language_summary', '')[:150]}...")
else:
    print(f"Error: {res_digital.get('message')}")
    print(f"Validation report: {res_digital.get('validation_report')}")

# -----------------------------------------------------------------
# 3. Sample 2: Scanned PDF (scanned_tax_notice.pdf)
# -----------------------------------------------------------------
print("\n" + "=" * 60)
print("TEST 3: Scanned PDF - samples/scanned_tax_notice.pdf")
print("=" * 60)
sample_scanned = Path("samples/scanned_tax_notice.pdf")
t0 = time.perf_counter()
res_scanned = process_notice(sample_scanned, client=client, allow_vision_fallback=True)
dur_scanned = time.perf_counter() - t0

print(f"Status: {res_scanned.get('status')}")
print(f"Category: {res_scanned.get('category')}")
print(f"Execution time: {dur_scanned:.2f}s")
if res_scanned.get("result"):
    headline = res_scanned["result"].get("headline") or {}
    print(f"Title: {headline.get('one_line_summary') or headline.get('title')}")
    print(f"Issuer: {headline.get('source_organisation')}")
    print(f"Amount due: {headline.get('amount_due')}")
    print(f"Deadlines found: {len(res_scanned['result'].get('deadlines', []))}")
    print(f"Action steps: {len(res_scanned['result'].get('action_steps', []))}")
    print(f"Summary: {res_scanned['result'].get('plain_language_summary', '')[:150]}...")
else:
    print(f"Error: {res_scanned.get('message')}")
    print(f"Validation report: {res_scanned.get('validation_report')}")

# -----------------------------------------------------------------
# 4. Sample 3: Phone Photo (phone_photo_scholarship_notice.jpg)
# -----------------------------------------------------------------
print("\n" + "=" * 60)
print("TEST 4: Phone Photo - samples/phone_photo_scholarship_notice.jpg")
print("=" * 60)
sample_photo = Path("samples/phone_photo_scholarship_notice.jpg")
photo_pdf_path = Path("scratch/converted_phone_photo.pdf")
photo_pdf_path.parent.mkdir(parents=True, exist_ok=True)

# Convert photo to PDF container as done in live upload
print("Converting photo to enhanced PDF container...")
clean_img, sharpness = normalize_and_strip_metadata(sample_photo.read_bytes())
enhanced_img = enhance_image_for_ocr(clean_img)
pdf_bytes = create_pdf_from_images([enhanced_img])
photo_pdf_path.write_bytes(pdf_bytes)
print(f"Preprocessed PDF created with sharpness: {sharpness:.1f}")

t0 = time.perf_counter()
res_photo = process_notice(photo_pdf_path, client=client, allow_vision_fallback=True)
dur_photo = time.perf_counter() - t0

print(f"Status: {res_photo.get('status')}")
print(f"Category: {res_photo.get('category')}")
print(f"Execution time: {dur_photo:.2f}s")
if res_photo.get("result"):
    headline = res_photo["result"].get("headline") or {}
    print(f"Title: {headline.get('one_line_summary') or headline.get('title')}")
    print(f"Issuer: {headline.get('source_organisation')}")
    print(f"Amount due: {headline.get('amount_due')}")
    print(f"Deadlines found: {len(res_photo['result'].get('deadlines', []))}")
    print(f"Action steps: {len(res_photo['result'].get('action_steps', []))}")
    print(f"Summary: {res_photo['result'].get('plain_language_summary', '')[:150]}...")
else:
    print(f"Error: {res_photo.get('message')}")
    print(f"Validation report: {res_photo.get('validation_report')}")

print("\n" + "=" * 60)
print("ALL LIVE TESTS FINISHED")
print("=" * 60)
