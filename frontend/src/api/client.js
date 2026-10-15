import sampleNotice from "../mocks/sample_notice.json";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export async function fetchSampleNotice() {
  try {
    const response = await fetch(`${API_BASE_URL}/notices/sample`);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn("Backend API unavailable, falling back to local mock notice:", error);
    return sampleNotice;
  }
}

export async function uploadNoticePdf(file) {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(`${API_BASE_URL}/notices/upload`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || `Upload failed with status ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn("API upload failed, simulating processing using local mock:", error);
    // Return sample notice with simulated timestamp for demo
    return {
      ...sampleNotice,
      notice_id: `notice-sim-${Date.now().toString(36)}`,
      title: {
        ...sampleNotice.title,
        value: `${file.name.replace(/\.pdf$/i, "")} (Demo Mock Extraction)`,
      },
    };
  }
}
