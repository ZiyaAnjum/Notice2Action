/**
 * API client module for Notice to Action.
 * Centralizes all backend network requests with unified error handling and typing.
 */

export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  "http://localhost:8000";

/**
 * Custom error class for API errors providing error code and friendly message.
 */
export class ApiError extends Error {
  constructor(message, status = 500, code = "UNKNOWN_ERROR", details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Handles fetch responses with standardized error extraction.
 */
async function handleResponse(response) {
  if (response.ok) {
    // 204 No Content
    if (response.status === 204) {
      return null;
    }
    return await response.json().catch(() => ({}));
  }

  let errorData = null;
  try {
    errorData = await response.json();
  } catch {
    errorData = null;
  }

  const status = response.status;
  let message = "An error occurred while connecting to the service.";
  let code = `HTTP_${status}`;

  if (errorData) {
    if (typeof errorData.message === "string") {
      message = errorData.message;
    } else if (errorData.detail) {
      if (typeof errorData.detail === "string") {
        message = errorData.detail;
      } else if (typeof errorData.detail === "object") {
        message = errorData.detail.message || JSON.stringify(errorData.detail);
        code = errorData.detail.error || errorData.detail.error_code || code;
      }
    }
    if (errorData.error) {
      code = errorData.error;
    } else if (errorData.error_code) {
      code = errorData.error_code;
    }
  } else {
    if (status === 404) {
      message = "The requested item or notice was not found.";
    } else if (status === 413) {
      message = "The uploaded file is too large. Please upload a smaller PDF.";
    } else if (status >= 500) {
      message = "The service encountered an error. Please try again in a few moments.";
    }
  }

  throw new ApiError(message, status, code, errorData);
}

/**
 * Upload an official notice PDF for asynchronous AI processing.
 * @param {File} file - PDF file to upload.
 * @returns {Promise<{ id: string, status: string, message: string }>}
 */
export async function uploadNotice(file) {
  if (!file) {
    throw new ApiError("Please select a valid PDF file to upload.", 400, "INVALID_FILE");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/notices`, {
    method: "POST",
    body: formData,
  });

  return await handleResponse(response);
}

/**
 * Retrieve a list of all notices sorted newest first.
 * @returns {Promise<Array<{ id: string, title: string, category: string|null, status: string, deadline_summary: string|null, needs_verification: boolean, created_at: string }>>}
 */
export async function listNotices() {
  const response = await fetch(`${API_BASE_URL}/api/notices`);
  return await handleResponse(response);
}

/**
 * Retrieve full notice details including extracted result JSON, checklist, and reminders.
 * @param {string} noticeId - Unique notice identifier.
 * @returns {Promise<{ id: string, original_filename: string, status: string, category: string|null, created_at: string, needs_verification: boolean, message: string|null, result: object|null, checklist: Array, reminders: Array }>}
 */
export async function getNotice(noticeId) {
  const response = await fetch(`${API_BASE_URL}/api/notices/${noticeId}`);
  return await handleResponse(response);
}

/**
 * Permanently delete a notice and its stored files.
 * @param {string} noticeId - Notice ID to delete.
 * @returns {Promise<{ status: string, id: string, message: string }>}
 */
export async function deleteNotice(noticeId) {
  const response = await fetch(`${API_BASE_URL}/api/notices/${noticeId}`, {
    method: "DELETE",
  });
  return await handleResponse(response);
}

/**
 * Retrieve extracted raw page text for source viewing.
 * @param {string} noticeId - Notice ID.
 * @param {number} pageNumber - 1-indexed page number.
 * @returns {Promise<{ page_number: number, text: string, char_count: number }>}
 */
export async function getNoticePage(noticeId, pageNumber) {
  const response = await fetch(`${API_BASE_URL}/api/notices/${noticeId}/pages/${pageNumber}`);
  return await handleResponse(response);
}

/**
 * Construct URL to download or view original uploaded PDF.
 * @param {string} noticeId - Notice ID.
 * @returns {string} URL to notice PDF.
 */
export function getNoticeFileUrl(noticeId) {
  return `${API_BASE_URL}/api/notices/${noticeId}/file`;
}

/**
 * Update the completion status of a checklist item.
 * @param {string} noticeId - Notice ID.
 * @param {string} itemKey - Checklist item identifier.
 * @param {"not_completed"|"completed"|"needs_verification"} status - Target status.
 * @returns {Promise<{ id: number|null, notice_id: string, item_key: string, status: string }>}
 */
export async function updateChecklistItem(noticeId, itemKey, status) {
  const response = await fetch(
    `${API_BASE_URL}/api/notices/${noticeId}/checklist/${encodeURIComponent(itemKey)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    }
  );
  return await handleResponse(response);
}

/**
 * Create a new deadline reminder for a notice.
 * @param {string} noticeId - Notice ID.
 * @param {{ deadline_ref?: string|null, remind_on: string, note?: string|null }} payload
 * @returns {Promise<{ id: string, notice_id: string, deadline_ref: string|null, remind_on: string, note: string|null, done: boolean }>}
 */
export async function createReminder(noticeId, payload) {
  const response = await fetch(`${API_BASE_URL}/api/notices/${noticeId}/reminders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return await handleResponse(response);
}

/**
 * List all reminders for a specific notice.
 * @param {string} noticeId - Notice ID.
 * @returns {Promise<Array>}
 */
export async function listNoticeReminders(noticeId) {
  const response = await fetch(`${API_BASE_URL}/api/notices/${noticeId}/reminders`);
  return await handleResponse(response);
}

/**
 * Get upcoming reminders across all notices.
 * @param {number} [days=14] - Horizon in days.
 * @returns {Promise<Array>}
 */
export async function getUpcomingReminders(days = 14) {
  const response = await fetch(`${API_BASE_URL}/api/reminders/upcoming?days=${days}`);
  return await handleResponse(response);
}

/**
 * Update an existing reminder (done status, note, or remind_on date).
 * @param {string} reminderId - Reminder ID.
 * @param {{ done?: boolean, note?: string, remind_on?: string }} payload
 * @returns {Promise<object>}
 */
export async function updateReminder(reminderId, payload) {
  const response = await fetch(`${API_BASE_URL}/api/reminders/${reminderId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return await handleResponse(response);
}

/**
 * Delete a reminder.
 * @param {string} reminderId - Reminder ID.
 * @returns {Promise<{ status: string, id: string }>}
 */
export async function deleteReminder(reminderId) {
  const response = await fetch(`${API_BASE_URL}/api/reminders/${reminderId}`, {
    method: "DELETE",
  });
  return await handleResponse(response);
}
