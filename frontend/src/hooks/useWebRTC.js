/**
 * useWebRTC - Custom React hook managing WebRTC Peer-to-Peer Mesh, WebSocket Signaling,
 * Screen Sharing, Real-Time Chat, and Synchronized Media States (Part 5 & Part 6).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getAccessToken } from '../services/api';
import {
  getWebSocketBaseUrl,
  getIceServers,
  DEFAULT_MEDIA_CONSTRAINTS,
  parseMediaError,
} from '../services/webrtc';

export function useWebRTC({ roomId, user, onRoomEnded, onNotification, onChatMessage }) {
  const cleanRoomId = (roomId || '').trim().toUpperCase();

  // Public UI State
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [remotePeers, setRemotePeers] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('idle'); // idle | requesting_media | connecting_ws | connected | reconnecting | disconnected | error
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [isRoomEnded, setIsRoomEnded] = useState(false);
  const [roomEndedMessage, setRoomEndedMessage] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);

  // Mutable Connection & Media State Refs (Avoid storing in React state to prevent re-renders)
  const peerConnectionsRef = useRef(new Map()); // Map<userId, RTCPeerConnection>
  const pendingCandidatesRef = useRef(new Map()); // Map<userId, Array<candidate>>
  const remoteStreamsRef = useRef(new Map()); // Map<userId, MediaStream>
  const remotePeersInfoRef = useRef(new Map()); // Map<userId, { id, name, role, isMuted, isVideoOff, isScreenSharing, connectionState }>
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const wasCameraEnabledBeforeScreenShareRef = useRef(true);
  const wsRef = useRef(null);
  const isMountedRef = useRef(true);
  const isCleaningUpRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const pingTimerRef = useRef(null);

  // Helper to send a signaling message over WebSocket
  const sendSignal = useCallback((message) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (err) {
        console.warn('[useWebRTC] Failed to send signaling message:', err);
      }
    }
  }, []);

  // Synchronize mutable remote peer data to React state
  const syncRemotePeersState = useCallback(() => {
    if (!isMountedRef.current) return;
    const peerList = [];
    remotePeersInfoRef.current.forEach((info, peerId) => {
      const rawStream = remoteStreamsRef.current.get(peerId) || null;
      // Pass a fresh MediaStream wrapper so VideoTile and React re-render when tracks arrive
      const stream = rawStream && rawStream.getTracks().length > 0
        ? new MediaStream(rawStream.getTracks())
        : null;

      peerList.push({
        id: peerId,
        name: info.name || 'Participant',
        role: info.role || 'participant',
        stream,
        isMuted: Boolean(info.isMuted),
        isVideoOff: Boolean(info.isVideoOff),
        isScreenSharing: Boolean(info.isScreenSharing),
        connectionState: info.connectionState || 'new',
      });
    });
    setRemotePeers(peerList);
  }, []);

  // Flush queued ICE candidates after setRemoteDescription
  const flushQueuedCandidates = useCallback(async (targetUserId, pc) => {
    const queued = pendingCandidatesRef.current.get(targetUserId);
    if (queued && queued.length > 0) {
      for (const candidateData of queued) {
        try {
          if (candidateData && (candidateData.candidate || candidateData.sdpMid)) {
            await pc.addIceCandidate(new RTCIceCandidate(candidateData));
          }
        } catch (err) {
          console.warn(`[useWebRTC] Error adding queued ICE candidate for ${targetUserId}:`, err);
        }
      }
      pendingCandidatesRef.current.delete(targetUserId);
    }
  }, []);

  // Replace video track across all active RTCPeerConnections (for Screen Share toggle)
  const replaceVideoTrackAcrossPeers = useCallback(async (newTrack) => {
    for (const [targetUserId, pc] of peerConnectionsRef.current.entries()) {
      try {
        const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
        const videoTransceiver = transceivers.find(
          (t) => (t.receiver?.track?.kind === 'video') || (t.sender?.track?.kind === 'video')
        );
        const senders = pc.getSenders ? pc.getSenders() : [];
        const videoSender = videoTransceiver?.sender || senders.find(
          (s) => s.track && s.track.kind === 'video'
        ) || senders.find((s) => !s.track);

        if (videoSender) {
          await videoSender.replaceTrack(newTrack);
        } else if (newTrack && localStreamRef.current) {
          pc.addTrack(newTrack, localStreamRef.current);
        }
      } catch (err) {
        console.warn(`[useWebRTC] Failed to replace track for peer ${targetUserId}:`, err);
      }
    }
  }, []);

  // Create an RTCPeerConnection for a given remote participant
  const createPeerConnection = useCallback((targetUserId, isInitiator = false) => {
    if (peerConnectionsRef.current.has(targetUserId)) {
      return peerConnectionsRef.current.get(targetUserId);
    }

    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
    });

    peerConnectionsRef.current.set(targetUserId, pc);

    // Determine active video track (Screen track if sharing, else Camera track)
    const activeVideoTrack =
      screenStreamRef.current?.getVideoTracks()[0] ||
      localStreamRef.current?.getVideoTracks()[0];
    const activeAudioTrack = localStreamRef.current?.getAudioTracks()[0];

    // Always ensure audio & video sections exist in SDP
    if (activeAudioTrack && localStreamRef.current) {
      try {
        pc.addTrack(activeAudioTrack, localStreamRef.current);
      } catch (err) {
        console.warn(`[useWebRTC] Error adding audio track to PC for ${targetUserId}:`, err);
      }
    } else if (pc.addTransceiver) {
      try {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      } catch {}
    }

    if (activeVideoTrack && localStreamRef.current) {
      try {
        pc.addTrack(activeVideoTrack, localStreamRef.current);
      } catch (err) {
        console.warn(`[useWebRTC] Error adding video track to PC for ${targetUserId}:`, err);
      }
    } else if (pc.addTransceiver) {
      try {
        pc.addTransceiver('video', { direction: 'sendrecv' });
      } catch {}
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type: 'ice_candidate',
          target: targetUserId,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      }
    };

    // Remote Track handler (Handles both event.track and event.streams[0])
    pc.ontrack = (event) => {
      let stream = remoteStreamsRef.current.get(targetUserId);
      if (!stream) {
        stream = new MediaStream();
        remoteStreamsRef.current.set(targetUserId, stream);
      }

      if (event.track) {
        if (!stream.getTracks().some((t) => t.id === event.track.id)) {
          stream.addTrack(event.track);
        }
        event.track.onunmute = () => {
          syncRemotePeersState();
        };
        event.track.onended = () => {
          syncRemotePeersState();
        };
      }

      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((incomingTrack) => {
          if (!stream.getTracks().some((t) => t.id === incomingTrack.id)) {
            stream.addTrack(incomingTrack);
          }
          incomingTrack.onunmute = () => {
            syncRemotePeersState();
          };
          incomingTrack.onended = () => {
            syncRemotePeersState();
          };
        });
      }

      syncRemotePeersState();
    };

    // Connection state change handler
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      const info = remotePeersInfoRef.current.get(targetUserId);
      if (info) {
        info.connectionState = state;
        syncRemotePeersState();
      }

      if (state === 'failed') {
        console.warn(`[useWebRTC] PeerConnection failed for ${targetUserId}, attempting ICE restart...`);
        pc.restartIce?.();
      }
    };

    // If this peer is the designated initiator, create the WebRTC OFFER
    if (isInitiator) {
      (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal({
            type: 'offer',
            target: targetUserId,
            description: offer,
          });
        } catch (err) {
          console.error(`[useWebRTC] Error creating offer for ${targetUserId}:`, err);
        }
      })();
    }

    return pc;
  }, [sendSignal, syncRemotePeersState]);

  // Request browser camera and microphone permissions and obtain MediaStream
  const acquireMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;

    setConnectionStatus('requesting_media');
    setMediaError(null);

    let stream = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia(DEFAULT_MEDIA_CONSTRAINTS);
    } catch (err) {
      console.warn('[useWebRTC] Standard getUserMedia failed, attempting fallback...', err);

      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (err2) {
        console.warn('[useWebRTC] Simple video+audio failed, trying audio-only...', err2);

        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (isMountedRef.current) {
            setCameraEnabled(false);
            setMediaError('Camera unavailable. Joined in audio-only mode.');
          }
        } catch (err3) {
          console.error('[useWebRTC] All media access failed:', err3);
          const friendlyMessage = parseMediaError(err3);
          if (isMountedRef.current) {
            setMediaError(friendlyMessage);
            setCameraEnabled(false);
            setMicrophoneEnabled(false);
          }
          return null;
        }
      }
    }

    if (stream && isMountedRef.current) {
      localStreamRef.current = stream;
      setLocalStream(stream);

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      setCameraEnabled(Boolean(videoTrack && videoTrack.enabled));
      setMicrophoneEnabled(Boolean(audioTrack && audioTrack.enabled));

      // Propagate tracks to existing peer connections if any exist
      for (const [targetUserId, pc] of peerConnectionsRef.current.entries()) {
        try {
          const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
          const senders = pc.getSenders ? pc.getSenders() : [];

          if (audioTrack) {
            const audioSender = senders.find((s) => s.track?.kind === 'audio') ||
              transceivers.find((t) => t.receiver?.track?.kind === 'audio')?.sender;
            if (audioSender) {
              audioSender.replaceTrack(audioTrack).catch(() => {});
            } else {
              pc.addTrack(audioTrack, stream);
            }
          }
          if (videoTrack) {
            const videoSender = senders.find((s) => s.track?.kind === 'video') ||
              transceivers.find((t) => t.receiver?.track?.kind === 'video')?.sender;
            if (videoSender) {
              videoSender.replaceTrack(videoTrack).catch(() => {});
            } else {
              pc.addTrack(videoTrack, stream);
            }
          }
        } catch (err) {
          console.warn(`[useWebRTC] Failed to attach tracks to peer ${targetUserId}:`, err);
        }
      }
    }

    return stream;
  }, []);

  // Connect to the FastAPI WebSocket signaling & chat endpoint
  const connectWebSocket = useCallback(async () => {
    if (!cleanRoomId || !user || isCleaningUpRef.current) return;

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setConnectionStatus((prev) => (prev === 'connected' ? 'reconnecting' : 'connecting_ws'));

    const wsUrl = `${getWebSocketBaseUrl()}/ws/meetings/${cleanRoomId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      reconnectAttemptsRef.current = 0;

      // Send auth message immediately upon connection
      try {
        const token = await getAccessToken();
        if (!token) {
          console.warn('[useWebRTC] No access token available for WebSocket');
          ws.close(4401, 'No access token');
          return;
        }

        ws.send(JSON.stringify({
          type: 'auth',
          token,
        }));
      } catch (err) {
        console.error('[useWebRTC] Failed to send auth token to WebSocket:', err);
      }
    };

    ws.onmessage = async (event) => {
      if (!isMountedRef.current || isCleaningUpRef.current) return;

      try {
        const message = JSON.parse(event.data);
        const msgType = message.type;

        // 1. Handshake response with current room state & media states
        if (msgType === 'room_state') {
          const peers = message.peers || [];
          peers.forEach((peer) => {
            const mediaState = peer.media_state || {};
            remotePeersInfoRef.current.set(peer.user_id, {
              id: peer.user_id,
              name: peer.full_name,
              role: peer.role,
              isMuted: !mediaState.microphone_enabled,
              isVideoOff: !mediaState.camera_enabled,
              isScreenSharing: Boolean(mediaState.screen_sharing),
              connectionState: 'connecting',
            });
          });
          syncRemotePeersState();
          reconnectAttemptsRef.current = 0;
          setConnectionStatus('connected');

          // Cloud Keepalive ping to prevent Render/gateway idle timeout (every 25 seconds)
          if (pingTimerRef.current) clearInterval(pingTimerRef.current);
          pingTimerRef.current = setInterval(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              try {
                wsRef.current.send(JSON.stringify({ type: 'ping' }));
              } catch {}
            }
          }, 25000);
        }

        // Liveness pong response
        else if (msgType === 'pong') {
          return;
        }

        // 2. A newcomer participant joined the room (We are existing peer -> Create OFFER)
        else if (msgType === 'peer_joined') {
          const peer = message.peer;
          if (peer && peer.user_id !== user.id) {
            const mediaState = peer.media_state || {};
            remotePeersInfoRef.current.set(peer.user_id, {
              id: peer.user_id,
              name: peer.full_name,
              role: peer.role,
              isMuted: !mediaState.microphone_enabled,
              isVideoOff: !mediaState.camera_enabled,
              isScreenSharing: Boolean(mediaState.screen_sharing),
              connectionState: 'connecting',
            });
            syncRemotePeersState();

            onNotification?.({
              id: Date.now(),
              text: `${peer.full_name || 'Participant'} joined the room`,
              type: 'join',
            });

            // Existing participant initiates OFFER toward newcomer
            createPeerConnection(peer.user_id, true);
          }
        }

        // 3. Received WebRTC OFFER from an existing peer
        else if (msgType === 'offer') {
          const senderId = message.sender;
          const sdpDescription = message.description;

          if (senderId && sdpDescription) {
            const pc = createPeerConnection(senderId, false);

            try {
              await pc.setRemoteDescription(new RTCSessionDescription(sdpDescription));
              await flushQueuedCandidates(senderId, pc);

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              sendSignal({
                type: 'answer',
                target: senderId,
                description: answer,
              });
            } catch (err) {
              console.error(`[useWebRTC] Error handling offer from ${senderId}:`, err);
            }
          }
        }

        // 4. Received WebRTC ANSWER
        else if (msgType === 'answer') {
          const senderId = message.sender;
          const sdpDescription = message.description;
          const pc = peerConnectionsRef.current.get(senderId);

          if (pc && sdpDescription) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(sdpDescription));
              await flushQueuedCandidates(senderId, pc);
            } catch (err) {
              console.error(`[useWebRTC] Error setting remote description for answer from ${senderId}:`, err);
            }
          }
        }

        // 5. Received ICE Candidate
        else if (msgType === 'ice_candidate') {
          const senderId = message.sender;
          const candidateData = message.candidate;
          const pc = peerConnectionsRef.current.get(senderId);

          if (candidateData) {
            if (pc && pc.remoteDescription && pc.remoteDescription.type) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidateData));
              } catch (err) {
                console.warn(`[useWebRTC] Error adding ICE candidate from ${senderId}:`, err);
              }
            } else {
              if (!pendingCandidatesRef.current.has(senderId)) {
                pendingCandidatesRef.current.set(senderId, []);
              }
              pendingCandidatesRef.current.get(senderId).push(candidateData);
            }
          }
        }

        // 6. Synchronized media state update (camera, mic, or screen sharing toggled)
        else if (msgType === 'media_state') {
          const peerId = message.user_id || message.user?.user_id;
          if (peerId && peerId !== user?.id) {
            const stateData = message.state || message;
            const mic = Boolean(stateData.microphone_enabled !== undefined ? stateData.microphone_enabled : true);
            const cam = Boolean(stateData.camera_enabled !== undefined ? stateData.camera_enabled : true);
            const scr = Boolean(stateData.screen_sharing);

            const info = remotePeersInfoRef.current.get(peerId);
            if (info) {
              const prevScreen = info.isScreenSharing;
              info.isMuted = !mic;
              info.isVideoOff = !cam;
              info.isScreenSharing = scr;
              syncRemotePeersState();

              if (!prevScreen && scr) {
                onNotification?.({
                  id: Date.now(),
                  text: `${info.name} started screen sharing.`,
                  type: 'screenshare',
                });
              } else if (prevScreen && !scr) {
                onNotification?.({
                  id: Date.now(),
                  text: `${info.name} stopped screen sharing.`,
                  type: 'screenshare',
                });
              }
            }
          }
        }

        // 7. In-Meeting Real-Time Chat Message (Part 6)
        else if (msgType === 'chat_message') {
          const isSelf = message.user?.user_id === user?.id;
          const newMsg = {
            id: message.message_id || Date.now(),
            message_id: message.message_id,
            user_id: message.user?.user_id,
            sender: isSelf ? `${message.user?.full_name || 'You'} (You)` : (message.user?.full_name || 'Participant'),
            text: message.message,
            sent_at: message.sent_at,
            time: message.sent_at
              ? new Date(message.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSelf,
          };
          setChatMessages((prev) => [...prev, newMsg]);
          onChatMessage?.(newMsg);
        }

        // 8. Remote participant disconnected
        else if (msgType === 'peer_left') {
          const leftUserId = message.user_id;
          if (leftUserId) {
            const info = remotePeersInfoRef.current.get(leftUserId);
            const peerName = info?.name || 'A participant';

            const pc = peerConnectionsRef.current.get(leftUserId);
            if (pc) {
              try {
                pc.close();
              } catch {}
              peerConnectionsRef.current.delete(leftUserId);
            }
            remoteStreamsRef.current.delete(leftUserId);
            pendingCandidatesRef.current.delete(leftUserId);
            remotePeersInfoRef.current.delete(leftUserId);
            syncRemotePeersState();

            onNotification?.({
              id: Date.now(),
              text: `${peerName} left the room`,
              type: 'leave',
            });
          }
        }

        // 9. Meeting ended by host
        else if (msgType === 'room_ended') {
          const endMsg = message.message || 'The host ended this meeting.';
          setIsRoomEnded(true);
          setRoomEndedMessage(endMsg);
          onRoomEnded?.(endMsg);
        }

        // 10. Error from server
        else if (msgType === 'error') {
          console.warn('[useWebRTC] Server error message:', message.message);
          onNotification?.({
            id: Date.now(),
            text: message.message,
            type: 'error',
          });
        }
      } catch (err) {
        console.error('[useWebRTC] Error parsing WebSocket message:', err);
      }
    };

    ws.onerror = (err) => {
      console.warn('[useWebRTC] WebSocket error:', err);
    };

    ws.onclose = (event) => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }

      if (!isMountedRef.current || isCleaningUpRef.current) return;

      console.info(`[useWebRTC] WebSocket closed (code: ${event.code}, reason: ${event.reason})`);

      if (event.code === 4400 && event.reason?.includes('ended')) {
        setIsRoomEnded(true);
        setRoomEndedMessage('This meeting has already ended.');
        onRoomEnded?.('This meeting has already ended.');
        return;
      }

      // Reconnect with exponential backoff if not closed cleanly
      if (event.code !== 1000 && reconnectAttemptsRef.current < 5) {
        reconnectAttemptsRef.current += 1;
        setConnectionStatus('reconnecting');
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 5000);

        reconnectTimerRef.current = setTimeout(() => {
          if (isMountedRef.current && !isCleaningUpRef.current) {
            connectWebSocket();
          }
        }, delay);
      } else if (reconnectAttemptsRef.current >= 5) {
        setConnectionStatus('disconnected');
      }
    };
  }, [cleanRoomId, user, createPeerConnection, flushQueuedCandidates, sendSignal, syncRemotePeersState, onRoomEnded, onNotification, onChatMessage]);

  // Main lifecycle: Initialize Media then WebSocket
  useEffect(() => {
    isMountedRef.current = true;
    isCleaningUpRef.current = false;

    if (!cleanRoomId || !user) return;

    let isEffectValid = true;

    const startSession = async () => {
      const stream = await acquireMedia();
      if (!isEffectValid || isCleaningUpRef.current) return;
      await connectWebSocket();
    };

    startSession();

    // Cleanup on unmount or route leave
    return () => {
      isEffectValid = false;
      isMountedRef.current = false;
      isCleaningUpRef.current = true;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }

      // Stop screen sharing tracks
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        screenStreamRef.current = null;
      }
      screenTrackRef.current = null;

      // Close WebSocket
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, 'Component unmounted');
        } catch {}
        wsRef.current = null;
      }

      // Close all PeerConnections
      peerConnectionsRef.current.forEach((pc) => {
        try {
          pc.close();
        } catch {}
      });
      peerConnectionsRef.current.clear();

      // Stop all local camera/mic media tracks (turns off hardware LED lights)
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
        localStreamRef.current = null;
      }

      // Clear internal maps
      remoteStreamsRef.current.clear();
      pendingCandidatesRef.current.clear();
      remotePeersInfoRef.current.clear();
    };
  }, [cleanRoomId, user, acquireMedia, connectWebSocket]);

  // Toggle Microphone (audioTrack.enabled)
  const toggleMicrophone = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicrophoneEnabled(audioTrack.enabled);

      sendSignal({
        type: 'media_state',
        state: {
          microphone_enabled: audioTrack.enabled,
          camera_enabled: cameraEnabled,
          screen_sharing: isScreenSharing,
        },
      });
    }
  }, [cameraEnabled, isScreenSharing, sendSignal]);

  // Toggle Camera (videoTrack.enabled)
  const toggleCamera = useCallback(async () => {
    // If currently screen sharing, track camera preference (Case 3 from specs)
    if (isScreenSharing) {
      wasCameraEnabledBeforeScreenShareRef.current = !wasCameraEnabledBeforeScreenShareRef.current;
      setCameraEnabled(wasCameraEnabledBeforeScreenShareRef.current);

      if (localStreamRef.current?.getVideoTracks()[0]) {
        localStreamRef.current.getVideoTracks()[0].enabled = wasCameraEnabledBeforeScreenShareRef.current;
      }

      sendSignal({
        type: 'media_state',
        state: {
          microphone_enabled: microphoneEnabled,
          camera_enabled: wasCameraEnabledBeforeScreenShareRef.current,
          screen_sharing: true,
        },
      });
      return;
    }

    if (!localStreamRef.current) {
      await acquireMedia();
      return;
    }

    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCameraEnabled(videoTrack.enabled);

      sendSignal({
        type: 'media_state',
        state: {
          microphone_enabled: microphoneEnabled,
          camera_enabled: videoTrack.enabled,
          screen_sharing: false,
        },
      });
    } else {
      // Dynamic camera acquisition if joined audio-only or camera was disabled
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: DEFAULT_MEDIA_CONSTRAINTS.video,
        });
        const newTrack = camStream.getVideoTracks()[0];
        if (newTrack && localStreamRef.current) {
          localStreamRef.current.addTrack(newTrack);
          await replaceVideoTrackAcrossPeers(newTrack);
          setCameraEnabled(true);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

          sendSignal({
            type: 'media_state',
            state: {
              microphone_enabled: microphoneEnabled,
              camera_enabled: true,
              screen_sharing: false,
            },
          });
        }
      } catch (err) {
        console.warn('[useWebRTC] Failed to acquire camera on toggle:', err);
        onNotification?.({
          id: Date.now(),
          text: 'Unable to access camera on this device.',
          type: 'warning',
        });
      }
    }
  }, [acquireMedia, isScreenSharing, microphoneEnabled, onNotification, replaceVideoTrackAcrossPeers, sendSignal]);

  // Stop Screen Share
  const stopScreenShare = useCallback(async () => {
    if (!screenStreamRef.current && !screenTrackRef.current) return;

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      screenStreamRef.current = null;
    }
    screenTrackRef.current = null;

    setIsScreenSharing(false);
    setScreenStream(null);

    // Restore camera track based on previous camera preference (Case 1, 2, 3)
    const shouldCameraBeOn = wasCameraEnabledBeforeScreenShareRef.current;
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];

    if (cameraTrack) {
      cameraTrack.enabled = shouldCameraBeOn;
      await replaceVideoTrackAcrossPeers(shouldCameraBeOn ? cameraTrack : null);
      setCameraEnabled(shouldCameraBeOn);
    } else {
      await replaceVideoTrackAcrossPeers(null);
      setCameraEnabled(false);
    }

    sendSignal({
      type: 'media_state',
      state: {
        microphone_enabled: microphoneEnabled,
        camera_enabled: shouldCameraBeOn,
        screen_sharing: false,
      },
    });

    onNotification?.({
      id: Date.now(),
      text: 'You stopped sharing your screen.',
      type: 'screenshare',
    });
  }, [microphoneEnabled, onNotification, replaceVideoTrackAcrossPeers, sendSignal]);

  // Start Screen Share
  const startScreenShare = useCallback(async () => {
    // Detect mobile device
    const isMobile = typeof navigator !== 'undefined' &&
      (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '') ||
       (navigator.maxTouchPoints && navigator.maxTouchPoints > 2));
    const isIPhone = typeof navigator !== 'undefined' && /iPhone|iPod/i.test(navigator.userAgent || '');

    if (isIPhone) {
      onNotification?.({
        id: Date.now(),
        text: 'Screen sharing from iPhones is restricted by iOS. You can still view other participants’ shared screens in HD.',
        type: 'warning',
      });
      return false;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      onNotification?.({
        id: Date.now(),
        text: 'Screen sharing is not supported by your mobile browser. You can still view shared screens.',
        type: 'warning',
      });
      return false;
    }

    try {
      const displayConstraints = isMobile
        ? { video: true, audio: false }
        : { video: { cursor: 'always' }, audio: false };

      let displayStream;
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
      } catch (constrainErr) {
        // Fallback for browsers that reject cursor or advanced constraints
        displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      }

      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return false;

      screenStreamRef.current = displayStream;
      screenTrackRef.current = screenTrack;
      wasCameraEnabledBeforeScreenShareRef.current = cameraEnabled;

      // Handle browser's native "Stop sharing" bar
      screenTrack.onended = () => {
        stopScreenShare();
      };

      // Replace outgoing video track on all peer connections
      await replaceVideoTrackAcrossPeers(screenTrack);

      setIsScreenSharing(true);
      setScreenStream(displayStream);

      sendSignal({
        type: 'media_state',
        state: {
          microphone_enabled: microphoneEnabled,
          camera_enabled: cameraEnabled,
          screen_sharing: true,
        },
      });

      onNotification?.({
        id: Date.now(),
        text: 'You started sharing your screen.',
        type: 'screenshare',
      });

      return true;
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        console.info('[useWebRTC] Screen sharing cancelled by user');
        onNotification?.({
          id: Date.now(),
          text: 'Screen sharing was cancelled.',
          type: 'info',
        });
      } else if (err.name === 'NotSupportedError' || err.message?.includes('not supported')) {
        onNotification?.({
          id: Date.now(),
          text: 'Screen sharing is not supported on this device.',
          type: 'warning',
        });
      } else {
        console.error('[useWebRTC] Error starting screen share:', err);
        onNotification?.({
          id: Date.now(),
          text: `Screen sharing couldn't start: ${err.message || 'Permission denied'}`,
          type: 'error',
        });
      }
      return false;
    }
  }, [cameraEnabled, microphoneEnabled, onNotification, replaceVideoTrackAcrossPeers, sendSignal, stopScreenShare]);

  // Toggle Screen Share
  const toggleScreenShare = useCallback(() => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  // Send In-Meeting Real-Time Chat Message (Part 6)
  const sendChatMessage = useCallback((text) => {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (trimmed.length > 2000) {
      onNotification?.({
        id: Date.now(),
        text: 'Message is too long (maximum 2000 characters).',
        type: 'error',
      });
      return false;
    }

    sendSignal({
      type: 'chat_send',
      message: trimmed,
    });
    return true;
  }, [onNotification, sendSignal]);

  // Clean Leave
  const leave = useCallback(() => {
    isCleaningUpRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }

    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }

    // Stop screen sharing tracks
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      screenStreamRef.current = null;
    }
    screenTrackRef.current = null;

    // Stop all local camera/mic tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      localStreamRef.current = null;
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    peerConnectionsRef.current.clear();

    // Close WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close(1000, 'User left meeting');
    }
    wsRef.current = null;

    remoteStreamsRef.current.clear();
    pendingCandidatesRef.current.clear();
    remotePeersInfoRef.current.clear();

    setLocalStream(null);
    setScreenStream(null);
    setIsScreenSharing(false);
    setRemotePeers([]);
    setConnectionStatus('disconnected');
    setChatMessages([]);
  }, []);

  return {
    localStream,
    screenStream,
    remotePeers,
    connectionStatus,
    cameraEnabled,
    microphoneEnabled,
    isScreenSharing,
    mediaError,
    isRoomEnded,
    roomEndedMessage,
    chatMessages,
    toggleCamera,
    toggleMicrophone,
    startScreenShare,
    stopScreenShare,
    toggleScreenShare,
    sendChatMessage,
    leave,
    retryMedia: acquireMedia,
  };
}

export default useWebRTC;
