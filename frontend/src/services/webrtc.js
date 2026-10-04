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
  const iceServers = [
    // 1. Google Public STUN servers
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302',
      ],
    },
    // 2. OpenRelay Public STUN
    {
      urls: 'stun:openrelay.metered.ca:80',
    },
    // 3. OpenRelay Community TURN Relay (UDP, TCP, TLS port 443, TURNS)
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];

  // Optional custom TURN credentials if provided in environment
  const customTurnServer = import.meta.env.VITE_TURN_SERVER;
  const customTurnUsername = import.meta.env.VITE_TURN_USERNAME;
  const customTurnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (customTurnServer && customTurnUsername && customTurnCredential) {
    iceServers.push({
      urls: customTurnServer,
      username: customTurnUsername,
      credential: customTurnCredential,
    });
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
