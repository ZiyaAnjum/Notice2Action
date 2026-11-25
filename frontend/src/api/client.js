/**
 * API client module for Notice to Action.
 * Centralizes all backend network requests with unified error handling and typing.
 */

const rawBaseUrl =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL =
  (typeof rawBaseUrl === "string" && rawBaseUrl.trim()
    ? rawBaseUrl.trim().replace(/\/+$/, "")
    : "") || "http://localhost:8001";

const DEFAULT_TIMEOUT_MS = 8000;
const UPLOAD_TIMEOUT_MS = 120000;

/**
 * In-memory access token storage (never saved to localStorage per security spec).
 */
let currentAccessToken = null;
let isRefreshing = false;
let refreshSubscribers = [];

export function setAccessToken(token) {
  currentAccessToken = token || null;
}

export function getAccessToken() {
  return currentAccessToken;
}

function onRefreshed(token) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

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
    if (status === 401) {
      message = "Session expired or unauthorized. Please sign in.";
      code = "UNAUTHORIZED";
    } else if (status === 403) {
      message = "You do not have permission to access this resource.";
      code = "FORBIDDEN";
    } else if (status === 404) {
      message = "The requested item or notice was not found.";
      code = "NOT_FOUND";
    } else if (status === 413) {
      message = "The uploaded file is too large. Please upload a smaller PDF.";
      code = "PAYLOAD_TOO_LARGE";
    } else if (status >= 500) {
      message = "The service encountered an error. Please try again in a few moments.";
      code = "SERVER_ERROR";
    }
  }

  throw new ApiError(message, status, code, errorData);
}

/**
 * Internal safe fetch wrapper with credentials: "include", Authorization header injection,
 * automatic timeout, and transparent 401 token refresh retry.
 */
async function safeFetch(url, options = {}, isRetry = false) {
  const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const fetchOptions = {
    ...options,
    credentials: "include",
    headers: {
      ...(options.headers || {}),
    },
    signal: options.signal || controller.signal,
  };
  delete fetchOptions.timeout;

  // Inject Authorization Bearer token if available and not explicitly provided
  if (currentAccessToken && !fetchOptions.headers.Authorization && !fetchOptions.headers.authorization) {
    fetchOptions.headers.Authorization = `Bearer ${currentAccessToken}`;
  }

  try {
    const response = await fetch(url, fetchOptions);

    // Transparent 401 retry via /auth/refresh
    const isAuthRoute =
      url.includes("/auth/login") ||
      url.includes("/auth/signup") ||
      url.includes("/auth/refresh");

    if (response.status === 401 && !isRetry && !isAuthRoute) {
      clearTimeout(timer);
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshRes = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: "POST",
            credentials: "include",
          });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            if (data?.access_token) {
              setAccessToken(data.access_token);
              onRefreshed(data.access_token);
            }
          } else {
            setAccessToken(null);
            onRefreshed(null);
          }
        } catch {
          setAccessToken(null);
          onRefreshed(null);
        } finally {
          isRefreshing = false;
        }
      }

      // If a new access token is available, retry the request once with fresh timeout
      if (currentAccessToken) {
        const retryHeaders = {
          ...(options.headers || {}),
          Authorization: `Bearer ${currentAccessToken}`,
        };
        return await safeFetch(url, { ...options, headers: retryHeaders, timeout: timeoutMs }, true);
      }
    }

    return response;
  } catch (err) {
    if (err.name === "AbortError" || controller.signal.aborted) {
      throw new ApiError(
        `Unable to reach backend service (${timeoutMs / 1000}s timeout). Please verify the server is running at ${API_BASE_URL}.`,
        0,
        "BACKEND_TIMEOUT",
        err
      );
    }
    if (
      err instanceof TypeError &&
      (err.message.includes("fetch") ||
        err.message.includes("NetworkError") ||
        err.message.includes("Failed"))
    ) {
      throw new ApiError(
        `Unable to connect to Notice to Action backend at ${API_BASE_URL}. Please ensure the backend server is running.`,
        0,
        "BACKEND_OFFLINE",
        err
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ==============================================================================
// AUTHENTICATION API METHODS
// ==============================================================================

/**
 * Register a new user account.
 * @param {{ full_name: string, email: string, password: string }} payload
 * @returns {Promise<{ access_token: string, token_type: string, user: object }>}
 */
export async function signup(payload) {
  const response = await safeFetch(`${API_BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await handleResponse(response);
  if (data?.access_token) {
    setAccessToken(data.access_token);
  }
  return data;
}

/**
 * Authenticate user with email and password.
 * @param {{ email: string, password: string }} payload
 * @returns {Promise<{ access_token: string, token_type: string, user: object }>}
 */
export async function login(payload) {
  const response = await safeFetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await handleResponse(response);
  if (data?.access_token) {
    setAccessToken(data.access_token);
  }
  return data;
}

/**
 * Sign out and invalidate active session cookie.
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function logout() {
  try {
    const response = await safeFetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
    });
    return await handleResponse(response);
  } finally {
    setAccessToken(null);
  }
}

/**
 * Refresh access token using httpOnly cookie.
 * @returns {Promise<{ access_token: string, token_type: string, user: object }>}
 */
export async function refreshAuthToken() {
  const response = await safeFetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: "POST",
  });
  const data = await handleResponse(response);
  if (data?.access_token) {
    setAccessToken(data.access_token);
  }
  return data;
}

/**
 * Retrieve authenticated user profile.
 * @returns {Promise<object>}
 */
export async function getMe() {
  const response = await safeFetch(`${API_BASE_URL}/api/auth/me`);
  return await handleResponse(response);
}

/**
 * Update authenticated user's profile details.
 * @param {{ full_name?: string, preferred_language?: string }} payload
 * @returns {Promise<object>}
 */
export async function updateProfile(payload) {
  const response = await safeFetch(`${API_BASE_URL}/api/auth/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await handleResponse(response);
}

/**
 * Change account password.
 * @param {{ current_password: string, new_password: string }} payload
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function changePassword(payload) {
  const response = await safeFetch(`${API_BASE_URL}/api/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await handleResponse(response);
}

/**
 * Delete account and all associated notices and uploaded files permanently.
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function deleteAccount() {
  try {
    const response = await safeFetch(`${API_BASE_URL}/api/auth/account`, {
      method: "DELETE",
    });
    return await handleResponse(response);
  } finally {
    setAccessToken(null);
  }
}

/**
 * Verify account email with token.
 * @param {string} token
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function verifyEmail(token) {
  const response = await safeFetch(
    `${API_BASE_URL}/api/auth/verify?token=${encodeURIComponent(token)}`
  );
  return await handleResponse(response);
}

/**
 * Resend account verification email.
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function resendVerification() {
  const response = await safeFetch(`${API_BASE_URL}/api/auth/resend-verification`, {
    method: "POST",
  });
  return await handleResponse(response);
}

/**
 * Request password reset email.
 * @param {{ email: string }} payload
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function forgotPassword(payload) {
  const response = await safeFetch(`${API_BASE_URL}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await handleResponse(response);
}

/**
 * Reset password using one-time token.
 * @param {{ token: string, new_password: string }} payload
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function resetPassword(payload) {
  const response = await safeFetch(`${API_BASE_URL}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await handleResponse(response);
}

/**
 * Upload an official notice PDF or multiple captured photos for asynchronous AI processing.
 * @param {File|File[]} fileOrFiles - Single PDF file or array of captured image files.
 * @returns {Promise<{ id: string, status: string, message: string }>}
 */
export async function uploadNotice(fileOrFiles) {
  if (!fileOrFiles) {
    throw new ApiError("Please select a valid PDF file or take photos to upload.", 400, "INVALID_FILE");
  }

  const formData = new FormData();
  if (Array.isArray(fileOrFiles)) {
    if (fileOrFiles.length === 0) {
      throw new ApiError("Please provide at least one photo or file to upload.", 400, "INVALID_FILE");
    }
    if (fileOrFiles.length === 1) {
      formData.append("file", fileOrFiles[0]);
    } else {
      for (const f of fileOrFiles) {
        formData.append("files", f);
      }
    }
  } else {
    formData.append("file", fileOrFiles);
  }

  const response = await safeFetch(`${API_BASE_URL}/api/notices`, {
    method: "POST",
    body: formData,
    timeout: UPLOAD_TIMEOUT_MS,
  });

  return await handleResponse(response);
}

/**
 * Retrieve a list of all notices sorted newest first.
 * @returns {Promise<Array<{ id: string, title: string, category: string|null, status: string, deadline_summary: string|null, needs_verification: boolean, created_at: string }>>}
 */
export async function listNotices() {
  const response = await safeFetch(`${API_BASE_URL}/api/notices`);
  const data = await handleResponse(response);
  return Array.isArray(data) ? data : [];
}

  /**
   * Retrieve full notice details including extracted result JSON, checklist, and reminders.
   * @param {string} noticeId - Unique notice identifier.
   * @returns {Promise<{ id: string, original_filename: string, status: string, category: string|null, created_at: string, needs_verification: boolean, message: string|null, result: object|null, checklist: Array, reminders: Array }>}
   */
  export async function getNotice(noticeId) {
    const response = await safeFetch(`${API_BASE_URL}/api/notices/${noticeId}`);
    return await handleResponse(response);
  }

  /**
   * Retrieve verified factual simple summary in the requested language (en, hi, kn).
   * @param {string} noticeId - Notice ID.
   * @param {string} [lang="en"] - Language code: "en" | "hi" | "kn".
   * @returns {Promise<{ what_is_this: string, what_to_do: string, by_when: string, if_you_ignore: string }>}
   */
  export async function getNoticeSummary(noticeId, lang = "en") {
    const response = await safeFetch(
      `${API_BASE_URL}/api/notices/${noticeId}/summary?lang=${encodeURIComponent(lang)}`
    );
    return await handleResponse(response);
  }

  /**
   * Permanently delete a notice and its stored files.
   * @param {string} noticeId - Notice ID to delete.
   * @returns {Promise<{ status: string, id: string, message: string }>}
   */
  export async function deleteNotice(noticeId) {
      const response = await safeFetch(`${API_BASE_URL}/api/notices/${noticeId}`, {
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
      const response = await safeFetch(`${API_BASE_URL}/api/notices/${noticeId}/pages/${pageNumber}`);
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
     * Re-queue background extraction pipeline for an existing notice.
     * @param {string} noticeId - Notice ID.
     * @returns {Promise<any>}
     */
    export async function retryNoticeExtraction(noticeId) {
      const response = await safeFetch(`${API_BASE_URL}/api/notices/${noticeId}/retry`, {
        method: "POST",
      });
      return await handleResponse(response);
    }

    /**
     * Authenticated fetch of the original notice PDF or photo file, returned as a temporary Blob URL.
     * The caller MUST revoke the Blob URL (URL.revokeObjectURL) when closing the viewer.
     * @param {string} noticeId - Notice ID.
     * @returns {Promise<{ blobUrl: string, isImage: boolean, mimeType: string, blob: Blob }>}
     */
    export async function fetchNoticeFileBlob(noticeId) {
      const response = await safeFetch(`${API_BASE_URL}/api/notices/${noticeId}/file`);
      if (!response.ok) {
        if (response.status === 404) {
          const err = new Error("Original document file is unavailable for this sample/notice.");
          err.code = "FILE_NOT_FOUND";
          throw err;
        }
        throw new Error(`Failed to load document file (HTTP ${response.status})`);
      }
      const blob = await response.blob();
      const mimeType = blob.type || "application/pdf";
      const isImage = mimeType.startsWith("image/");
      const blobUrl = URL.createObjectURL(blob);
      return { blobUrl, isImage, mimeType, blob };
    }

    /**
     * Construct URL to view original page image (original color photo or rendered page).
     * @param {string} noticeId - Notice ID.
     * @param {number} [pageNumber=1] - 1-indexed page number.
     * @returns {string} URL to page image.
     */
    export function getNoticePageImageUrl(noticeId, pageNumber = 1) {
      return `${API_BASE_URL}/api/notices/${noticeId}/pages/${pageNumber}/image`;
    }

    /**
     * Update the completion status of a checklist item.
     * @param {string} noticeId - Notice ID.
     * @param {string} itemKey - Checklist item identifier.
     * @param {"not_completed"|"completed"|"needs_verification"} status - Target status.
     * @returns {Promise<{ id: number|null, notice_id: string, item_key: string, status: string }>}
     */
    export async function updateChecklistItem(noticeId, itemKey, status) {
  const response = await safeFetch(
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
        const response = await safeFetch(`${API_BASE_URL}/api/notices/${noticeId}/reminders`, {
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
  const response = await safeFetch(`${API_BASE_URL}/api/notices/${noticeId}/reminders`);
  const data = await handleResponse(response);
  return Array.isArray(data) ? data : [];
}

/**
 * Get upcoming reminders across all notices.
 * @param {number} [days=14] - Horizon in days.
 * @returns {Promise<Array>}
 */
export async function getUpcomingReminders(days = 14) {
  const response = await safeFetch(`${API_BASE_URL}/api/reminders/upcoming?days=${days}`);
  const data = await handleResponse(response);
  return Array.isArray(data) ? data : [];
}

      /**
       * Update an existing reminder (done status, note, or remind_on date).
       * @param {string} reminderId - Reminder ID.
       * @param {{ done?: boolean, note?: string, remind_on?: string }} payload
       * @returns {Promise<object>}
       */
      export async function updateReminder(reminderId, payload) {
          const response = await safeFetch(`${API_BASE_URL}/api/reminders/${reminderId}`, {
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
            const response = await safeFetch(`${API_BASE_URL}/api/reminders/${reminderId}`, {
              method: "DELETE",
            });
            return await handleResponse(response);
          }
