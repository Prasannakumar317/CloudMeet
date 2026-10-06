/**
 * CloudMeet Frontend API Client Service
 * 
 * Centralized communication layer with the Python FastAPI backend.
 * Provides:
 * - Automatic injection of active Supabase JWT Bearer access token
 * - Standardized timeout handling with AbortController (15s default)
 * - Safe single-attempt retry on 401 session expiry
 * - Centralized HTTP status error mapping (401, 403, 404, 422, 429, 500, 503, network, timeout)
 * - Safe user profile updating
 */

import { supabase } from '../lib/supabase';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
const DEFAULT_TIMEOUT_MS = 15000;
const CREATE_MEETING_TIMEOUT_MS = 60000; // 60s to accommodate cloud cold starts (typically 35-50s)

/**
 * Retrieve the current Supabase session access token.
 */
export async function getAccessToken() {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch (err) {
    console.warn('[API Service] Failed to retrieve access token:', err);
    return null;
  }
}

/**
 * Generic fetch wrapper for FastAPI endpoints with timeouts and unified error handling.
 */
export async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  // Attach Supabase JWT Bearer token if not explicitly provided
  if (!headers.Authorization && !headers.authorization) {
    const token = await getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const { timeout: _to, _isRetry, ...customOptions } = options;
  const config = {
    ...customOptions,
    headers,
    signal: options.signal || controller.signal,
  };

  try {
    const response = await fetch(url, config);
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    // If 401 Unauthorized and not already retrying, attempt one session refresh
    if (response.status === 401 && !_isRetry && supabase) {
      try {
        const { data: refreshData } = await supabase.auth.refreshSession();
        const newToken = refreshData?.session?.access_token;
        if (newToken) {
          return await request(endpoint, {
            ...options,
            _isRetry: true,
            headers: {
              ...headers,
              Authorization: `Bearer ${newToken}`,
            },
          });
        }
      } catch (refreshErr) {
        console.warn('[API Service] Session refresh failed:', refreshErr);
      }
    }

    // Parse JSON or text response
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      let friendlyMessage = 'An error occurred while processing your request.';

      switch (response.status) {
        case 401:
          friendlyMessage = 'Your session has expired. Please sign in again.';
          break;
        case 403:
          friendlyMessage = typeof data?.detail === 'string' ? data.detail : 'You do not have permission to perform this action.';
          break;
        case 404:
          friendlyMessage = typeof data?.detail === 'string' ? data.detail : 'The requested resource could not be found.';
          break;
        case 422:
          friendlyMessage = typeof data?.detail === 'string' ? data.detail : 'Please check your input and try again.';
          break;
        case 429:
          friendlyMessage = 'Too many requests. Please wait a moment and try again.';
          break;
        case 500:
          friendlyMessage = 'An unexpected server error occurred. Please try again later.';
          break;
        case 502:
          friendlyMessage = 'CloudMeet service is warming up. Please try again in a few moments.';
          break;
        case 503:
          friendlyMessage = 'CloudMeet service is temporarily unavailable. Please try again shortly.';
          break;
        case 504:
          friendlyMessage = 'Gateway timed out waiting for CloudMeet service. Please try again shortly.';
          break;
        default:
          friendlyMessage = typeof data?.detail === 'string' ? data.detail : (response.statusText || friendlyMessage);
      }

      const error = new Error(friendlyMessage);
      error.status = response.status;
      error.data = data;
      error.durationMs = durationMs;
      error.receivedResponse = true;
      throw error;
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    error.durationMs = durationMs;
    error.receivedResponse = error.receivedResponse ?? false;

    // Timeout via AbortController
    if (error.name === 'AbortError') {
      const timeoutError = new Error('The request took too long. The server may be warming up. Please try again.');
      timeoutError.status = 408;
      timeoutError.durationMs = durationMs;
      timeoutError.receivedResponse = false;
      timeoutError.originalError = error;
      throw timeoutError;
    }

    // Network disconnection / Server unreachable
    if (error.name === 'TypeError' && (error.message.includes('fetch') || error.message.includes('NetworkError') || error.message.includes('Failed to fetch'))) {
      const netError = new Error('Unable to connect to CloudMeet server. Please check your connection and try again shortly.');
      netError.status = 0;
      netError.durationMs = durationMs;
      netError.receivedResponse = false;
      netError.originalError = error;
      throw netError;
    }

    throw error;
  }
}

// ==========================================
// Reusable Meeting API Functions
// ==========================================

export async function createMeeting(title = 'CloudMeet Meeting', options = {}) {
  const idempotencyKey = options.idempotencyKey || `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return request('/api/meetings', {
    method: 'POST',
    timeout: options.timeout || CREATE_MEETING_TIMEOUT_MS,
    headers: {
      'Idempotency-Key': idempotencyKey,
      ...(options.headers || {}),
    },
    body: JSON.stringify({ title: (title || '').trim() || 'CloudMeet Meeting' }),
  });
}

export async function getMeeting(roomId) {
  const cleanId = encodeURIComponent((roomId || '').trim().toUpperCase());
  return request(`/api/meetings/${cleanId}`, {
    method: 'GET',
  });
}

export async function joinMeeting(roomId) {
  const cleanId = encodeURIComponent((roomId || '').trim().toUpperCase());
  return request(`/api/meetings/${cleanId}/join`, {
    method: 'POST',
  });
}

export async function leaveMeeting(roomId) {
  const cleanId = encodeURIComponent((roomId || '').trim().toUpperCase());
  return request(`/api/meetings/${cleanId}/leave`, {
    method: 'POST',
  });
}

export async function endMeeting(roomId) {
  const cleanId = encodeURIComponent((roomId || '').trim().toUpperCase());
  return request(`/api/meetings/${cleanId}/end`, {
    method: 'POST',
  });
}

export async function getParticipants(roomId) {
  const cleanId = encodeURIComponent((roomId || '').trim().toUpperCase());
  return request(`/api/meetings/${cleanId}/participants`, {
    method: 'GET',
  });
}

export async function getMyMeetings() {
  return request('/api/meetings/my', {
    method: 'GET',
  });
}

// ==========================================
// System Health and User Profiles
// ==========================================

export async function checkHealth() {
  return request('/api/health');
}

export async function getCurrentUserProfile() {
  return request('/api/users/me');
}

export async function updateUserProfile(fullName) {
  const cleanedName = (fullName || '').trim();
  return request('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ full_name: cleanedName }),
  });
}

export const api = {
  baseUrl: API_BASE_URL,
  health: {
    check: checkHealth,
    root: () => request('/'),
  },
  users: {
    getMe: getCurrentUserProfile,
    updateMe: updateUserProfile,
  },
  meetings: {
    create: createMeeting,
    getMeeting: getMeeting,
    getDetails: getMeeting,
    join: joinMeeting,
    leave: leaveMeeting,
    end: endMeeting,
    getParticipants: getParticipants,
    getMyMeetings: getMyMeetings,
  },
};

export default api;
