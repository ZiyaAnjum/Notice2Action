import os
import sys
import time
import subprocess
from pathlib import Path

DIST_INDEX = Path(__file__).resolve().parent.parent / "frontend" / "dist" / "index.html"
SCREENSHOT_DIR = Path(__file__).resolve().parent.parent / "screenshots"
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

def find_browser():
    chrome = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    if chrome.exists():
        return str(chrome)
    edge = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
    if edge.exists():
        return str(edge)
    raise FileNotFoundError("Neither Chrome nor Edge was found.")

def capture_screenshot(browser_exe, url, output_path, width=1280, height=950):
    cmd = [
        browser_exe,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--hide-scrollbars",
        "--allow-file-access-from-files",
        "--virtual-time-budget=2000",
        f"--window-size={width},{height}",
        f"--screenshot={output_path}",
        url,
    ]
    print(f"Capturing: {output_path.name} ({width}x{height}) -> {url}")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    if output_path.exists():
        print(f"  ✓ Saved {output_path.name} ({output_path.stat().st_size} bytes)")
    else:
        print(f"  ✗ Failed to save {output_path.name}: {res.stderr.decode('utf-8', errors='ignore')}")

def main():
    browser_exe = find_browser()
    print(f"Using browser: {browser_exe}")

    file_url_base = f"file:///{DIST_INDEX.as_posix()}"

    targets = [
        {
            "name": "screenshot_complete.png",
            "url": f"{file_url_base}#/notices/sample_electricity_notice?fixture=complete",
            "width": 1280,
            "height": 1150,
        },
        {
            "name": "screenshot_partial.png",
            "url": f"{file_url_base}#/notices/notice-partial-002?fixture=partial",
            "width": 1280,
            "height": 1150,
        },
        {
            "name": "screenshot_processing.png",
            "url": f"{file_url_base}#/notices/notice-proc-004?fixture=processing",
            "width": 1280,
            "height": 950,
        },
        {
            "name": "screenshot_failed.png",
            "url": f"{file_url_base}#/notices/notice-failed-003?fixture=failed",
            "width": 1280,
            "height": 850,
        },
        {
            "name": "screenshot_mobile.png",
            "url": f"{file_url_base}#/notices/sample_electricity_notice?fixture=complete",
            "width": 375,
            "height": 812,
        },
    ]

    for t in targets:
        out_file = SCREENSHOT_DIR / t["name"]
        capture_screenshot(browser_exe, t["url"], out_file, t["width"], t["height"])

    print("All screenshots finished.")

if __name__ == "__main__":
    main()
