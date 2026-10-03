/**
 * CloudMeet WebRTC & Signaling Configuration Service (Part 5)
 */

export function getWebSocketBaseUrl() {
  const customWsUrl = import.meta.env.VITE_WS_URL ? String(import.meta.env.VITE_WS_URL).trim() : '';
  if (customWsUrl) {
    let clean = customWsUrl.replace(/\/+$/, '');
    if (clean.startsWith('https://')) {
      return clean.replace(/^https:\/\//, 'wss://');
    }
    if (clean.startsWith('http://')) {
      return clean.replace(/^http:\/\//, 'ws://');
    }
    if (clean.startsWith('wss://') || clean.startsWith('ws://')) {
      return clean;
    }
    return clean.includes('localhost') || clean.includes('127.0.0.1')
      ? `ws://${clean}`
      : `wss://${clean}`;
  }

  const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8000').trim().replace(/\/+$/, '');
  if (apiUrl.startsWith('https://')) {
    return apiUrl.replace(/^https:\/\//, 'wss://');
  }
  if (apiUrl.startsWith('http://')) {
    return apiUrl.replace(/^http:\/\//, 'ws://');
  }
  if (apiUrl.startsWith('wss://') || apiUrl.startsWith('ws://')) {
    return apiUrl;
  }
  return apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')
    ? `ws://${apiUrl}`
    : `wss://${apiUrl}`;
}

export function getIceServers() {
  const stunUrl = import.meta.env.VITE_STUN_SERVER || 'stun:stun.l.google.com:19302';
  const iceServers = [{ urls: stunUrl }];

  const turnServer = import.meta.env.VITE_TURN_SERVER;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnServer) {
    const turnConfig = { urls: turnServer };
    if (turnUsername) turnConfig.username = turnUsername;
    if (turnCredential) turnConfig.credential = turnCredential;
    iceServers.push(turnConfig);
  }

  return iceServers;
}

export const DEFAULT_MEDIA_CONSTRAINTS = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: 'user',
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

export function parseMediaError(error) {
  if (!error) return 'Unable to access media devices.';

  const errorName = error.name || '';
  switch (errorName) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera and microphone access was denied. Please allow camera and microphone permissions in your browser address bar and reload.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera or microphone was detected on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Your camera or microphone is currently being used by another application. Please close other video apps and retry.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'Your camera does not support the requested resolution constraints.';
    case 'SecurityError':
      return 'Media access was blocked due to browser security restrictions.';
    default:
      return error.message || 'An error occurred while accessing your camera and microphone.';
  }
}
