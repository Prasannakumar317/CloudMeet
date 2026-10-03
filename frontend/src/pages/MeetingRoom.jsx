import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Copy,
  Check,
  Users,
  MessageSquare,
  Shield,
  Wifi,
  Send,
  X,
  UserPlus,
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  Share2,
  Info,
  Maximize2,
  PhoneOff,
  Power,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Home,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import Logo from '../components/Logo';
import VideoTile from '../components/VideoTile';
import MeetingControls from '../components/MeetingControls';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';
import {
  getMeeting,
  joinMeeting,
  leaveMeeting,
  endMeeting,
  getParticipants,
} from '../services/api';
import useWebRTC from '../hooks/useWebRTC';

const AVATAR_PALETTES = [
  'from-indigo-600 to-violet-600',
  'from-emerald-600 to-teal-700',
  'from-blue-600 to-cyan-600',
  'from-amber-600 to-orange-700',
  'from-rose-600 to-pink-700',
  'from-purple-600 to-indigo-700',
];

export default function MeetingRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const cleanRoomId = (roomId || '').trim().toUpperCase();

  // Primary Meeting State
  // 'loading' | 'joining' | 'joined' | 'ended' | 'not_found' | 'unauthorized' | 'network_error' | 'error'
  const [roomState, setRoomState] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [meetingData, setMeetingData] = useState(null);
  const [participants, setParticipants] = useState([]);

  // Local interactive UI state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [dismissMediaBanner, setDismissMediaBanner] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Action modals
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  // Refs
  const isMountedRef = useRef(true);
  const chatMessagesEndRef = useRef(null);
  const screenShareVideoRef = useRef(null);

  const currentUserName =
    user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'You';

  // Determine if current user is host
  const isHost = Boolean(
    user &&
      meetingData &&
      (meetingData.host_supabase_user_id === user.id ||
        meetingData.role === 'host' ||
        participants.some((p) => p.id === user.id && p.role === 'host'))
  );

  // Toast Notification helper
  const addToast = useCallback((text, type = 'info') => {
    if (!isMountedRef.current) return;
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, text, type }]);
    setTimeout(() => {
      if (isMountedRef.current) {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }
    }, 3500);
  }, []);

  // WebRTC notifications & chat triggers
  const handleNotification = useCallback(
    ({ text, type }) => {
      addToast(text, type);
    },
    [addToast]
  );

  const handleChatMessage = useCallback(
    (msg) => {
      if (!isChatOpen && msg.user_id !== user?.id) {
        setUnreadCount((c) => c + 1);
      }
    },
    [isChatOpen, user?.id]
  );

  const handleHostEndedRoom = useCallback((msg) => {
    if (isMountedRef.current) {
      setRoomState('ended');
      setErrorMessage(msg || 'The host ended this meeting.');
    }
  }, []);

  // WebRTC Mesh, WebSocket Signaling, Screen Share & Chat Hook
  const {
    localStream,
    screenStream,
    remotePeers,
    connectionStatus: rtcStatus,
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
    leave: cleanupWebRTC,
    retryMedia,
  } = useWebRTC({
    roomId: roomState === 'joined' ? cleanRoomId : null,
    user,
    onRoomEnded: handleHostEndedRoom,
    onNotification: handleNotification,
    onChatMessage: handleChatMessage,
  });

  // Handle room ended signal from hook
  useEffect(() => {
    if (isRoomEnded && roomState !== 'ended') {
      setRoomState('ended');
      setErrorMessage(roomEndedMessage || 'The host ended this meeting.');
    }
  }, [isRoomEnded, roomEndedMessage, roomState]);

  // Reset unread count when opening chat
  useEffect(() => {
    if (isChatOpen) {
      setUnreadCount(0);
    }
  }, [isChatOpen]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (isChatOpen) {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen]);

  // Helper to refresh active participants from Part 4 API
  const refreshParticipants = useCallback(async () => {
    if (!cleanRoomId || roomState !== 'joined') return;
    try {
      const res = await getParticipants(cleanRoomId);
      if (isMountedRef.current && res?.participants) {
        setParticipants(res.participants);
      }
    } catch (err) {
      if (err.status === 404 || err.status === 400) {
        try {
          const m = await getMeeting(cleanRoomId);
          if (m?.status === 'ended' && isMountedRef.current) {
            setRoomState('ended');
          }
        } catch {}
      }
    }
  }, [cleanRoomId, roomState]);

  // Initial Room Join Flow (Part 4 REST Validation)
  useEffect(() => {
    isMountedRef.current = true;

    if (!cleanRoomId) {
      setRoomState('not_found');
      setErrorMessage('Invalid meeting ID specified.');
      return;
    }

    if (!user) {
      setRoomState('unauthorized');
      return;
    }

    let isSubscribed = true;

    const initMeeting = async () => {
      setRoomState('loading');
      setErrorMessage('');

      try {
        const meetingInfo = await getMeeting(cleanRoomId);

        if (!isSubscribed) return;

        if (meetingInfo.status === 'ended') {
          setRoomState('ended');
          setMeetingData(meetingInfo);
          return;
        }

        setMeetingData(meetingInfo);
        setRoomState('joining');

        const joinRes = await joinMeeting(cleanRoomId);

        if (!isSubscribed) return;

        const partsRes = await getParticipants(cleanRoomId);

        if (!isSubscribed) return;

        setParticipants(partsRes?.participants || [joinRes.participant]);
        setRoomState('joined');
      } catch (err) {
        console.error('[MeetingRoom] Init failed:', err);
        if (!isSubscribed) return;

        if (err.status === 404) {
          setRoomState('not_found');
          setErrorMessage("We couldn't find that meeting. Check the meeting ID and try again.");
        } else if (err.status === 400 && err.message?.toLowerCase().includes('ended')) {
          setRoomState('ended');
          setErrorMessage('This meeting has already ended.');
        } else if (err.status === 401) {
          setRoomState('unauthorized');
          setErrorMessage('Please sign in to continue.');
        } else if (err.status === 0 || err.message?.includes('reach CloudMeet')) {
          setRoomState('network_error');
          setErrorMessage("We couldn't reach CloudMeet. Please check your connection and try again.");
        } else {
          setRoomState('error');
          setErrorMessage(err.message || 'Something went wrong while processing the meeting.');
        }
      }
    };

    initMeeting();

    return () => {
      isSubscribed = false;
      isMountedRef.current = false;
    };
  }, [cleanRoomId, user]);

  // Polling active participants
  useEffect(() => {
    if (roomState !== 'joined') return;

    const interval = setInterval(() => {
      refreshParticipants();
    }, 5000);

    return () => clearInterval(interval);
  }, [roomState, refreshParticipants]);

  // Window unload listener to guarantee WebRTC track and socket release
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupWebRTC();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [cleanupWebRTC]);

  // Handle Copy Room ID / Link
  const handleCopyMeetingId = () => {
    navigator.clipboard?.writeText(cleanRoomId);
    setCopiedLink(true);
    addToast('Meeting ID copied to clipboard.', 'info');
    setTimeout(() => {
      if (isMountedRef.current) setCopiedLink(false);
    }, 2000);
  };

  const handleShareMeeting = async () => {
    const meetingUrl = `${window.location.origin}/meeting/${cleanRoomId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join CloudMeet: ${meetingData?.title || 'Meeting'}`,
          text: `Join my CloudMeet meeting: ${cleanRoomId}`,
          url: meetingUrl,
        });
        return;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('[MeetingRoom] Share API failed, falling back to clipboard:', err);
        }
      }
    }

    navigator.clipboard?.writeText(meetingUrl);
    setCopiedLink(true);
    addToast('Meeting link copied to clipboard.', 'info');
    setTimeout(() => {
      if (isMountedRef.current) setCopiedLink(false);
    }, 2000);
  };

  // Handle Send Real-Time Chat Message (Part 6)
  const handleSendMessage = (e) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;

    const success = sendChatMessage(chatInput);
    if (success) {
      setChatInput('');
    }
  };

  // Handle Participant Leave (WebRTC cleanup + REST leave)
  const handleLeaveConfirm = async () => {
    if (isLeaving) return;
    setIsLeaving(true);

    try {
      cleanupWebRTC();
      await leaveMeeting(cleanRoomId);
    } catch (err) {
      console.warn('[MeetingRoom] Leave request error, navigating anyway:', err);
    } finally {
      if (isMountedRef.current) {
        setIsLeaving(false);
        setShowLeaveModal(false);
      }
      navigate('/');
    }
  };

  // Handle Host End Meeting (WebRTC cleanup + REST end)
  const handleEndConfirm = async () => {
    if (isEnding) return;
    setIsEnding(true);

    try {
      cleanupWebRTC();
      await endMeeting(cleanRoomId);
      if (isMountedRef.current) {
        setIsEnding(false);
        setShowEndModal(false);
      }
      navigate('/');
    } catch (err) {
      console.error('[MeetingRoom] End meeting error:', err);
      if (isMountedRef.current) {
        setIsEnding(false);
        alert(err.message || 'Failed to end meeting.');
      }
    }
  };

  // Combine live WebRTC peers with REST participant state
  const remoteTiles = useMemo(() => {
    const tiles = [];
    const seenIds = new Set();

    // 1. Live WebRTC peers from WebSocket signaling
    remotePeers.forEach((peer) => {
      seenIds.add(peer.id);
      tiles.push({
        id: peer.id,
        name: peer.name,
        role: peer.role,
        stream: peer.stream,
        isMuted: peer.isMuted,
        isVideoOff: peer.isVideoOff,
        isScreenSharing: peer.isScreenSharing,
        connectionState: peer.connectionState,
      });
    });

    // 2. Participants from REST DB not yet connected via WebRTC
    participants.forEach((p) => {
      if (p.id !== user?.id && !seenIds.has(p.id)) {
        seenIds.add(p.id);
        tiles.push({
          id: p.id,
          name: p.full_name || p.email || 'Participant',
          role: p.role || 'participant',
          stream: null,
          isMuted: false,
          isVideoOff: true,
          isScreenSharing: false,
          connectionState: 'connecting',
        });
      }
    });

    return tiles;
  }, [remotePeers, participants, user?.id]);

  // Identify active screen sharer (if any) for Prominent Screen Share Layout
  const activeScreenShare = useMemo(() => {
    if (isScreenSharing && screenStream) {
      return {
        id: user?.id,
        name: `${currentUserName} (You)`,
        isSelf: true,
        stream: screenStream,
      };
    }

    const remoteSharer = remotePeers.find((p) => p.isScreenSharing && p.stream);
    if (remoteSharer) {
      return {
        id: remoteSharer.id,
        name: remoteSharer.name,
        isSelf: false,
        stream: remoteSharer.stream,
      };
    }

    return null;
  }, [isScreenSharing, screenStream, user?.id, currentUserName, remotePeers]);

  // Attach active screen share MediaStream to featured video element
  useEffect(() => {
    const videoEl = screenShareVideoRef.current;
    if (!videoEl) return;

    if (activeScreenShare?.stream) {
      videoEl.srcObject = activeScreenShare.stream;
      videoEl.play().catch((err) => {
        console.debug('[MeetingRoom] Screen share video autoplay:', err);
      });
    } else {
      videoEl.srcObject = null;
    }
  }, [activeScreenShare]);

  // Dynamic connection badge configuration
  const connectionBadge = useMemo(() => {
    switch (rtcStatus) {
      case 'connected':
        return {
          dotColor: 'bg-emerald-400 animate-pulse',
          label: 'Connected',
          subLabel: 'HD',
        };
      case 'requesting_media':
        return {
          dotColor: 'bg-amber-400 animate-pulse',
          label: 'Media Setup',
          subLabel: 'Perms',
        };
      case 'connecting_ws':
        return {
          dotColor: 'bg-amber-400 animate-pulse',
          label: 'Connecting...',
          subLabel: 'WS',
        };
      case 'reconnecting':
        return {
          dotColor: 'bg-amber-500 animate-pulse',
          label: 'Reconnecting...',
          subLabel: 'Mesh',
        };
      case 'disconnected':
        return {
          dotColor: 'bg-rose-500',
          label: 'Disconnected',
          subLabel: 'Offline',
        };
      default:
        return {
          dotColor: 'bg-slate-400',
          label: 'Initializing',
          subLabel: 'Ready',
        };
    }
  }, [rtcStatus]);

  // Total active participants in room
  const totalParticipantCount = 1 + remoteTiles.length;

  // ========================================================
  // RENDER UI STATES
  // ========================================================

  // 1. Loading & Joining States
  if (roomState === 'loading' || roomState === 'joining') {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4 select-none">
        <div className="flex flex-col items-center max-w-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">
              {roomState === 'joining' ? 'Entering Room...' : 'Connecting to CloudMeet...'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Verifying meeting credentials for room{' '}
              <span className="font-mono text-indigo-400 font-semibold">{cleanRoomId}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Meeting Ended State
  if (roomState === 'ended') {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4 select-none">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto">
            <Power className="w-7 h-7 text-rose-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">This meeting has ended</h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              {errorMessage || 'The host has ended this meeting session. Thank you for using CloudMeet.'}
            </p>
          </div>
          <div className="pt-2">
            <Button
              onClick={() => navigate('/')}
              variant="primary"
              size="md"
              fullWidth
              icon={Home}
            >
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Meeting Not Found State
  if (roomState === 'not_found') {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4 select-none">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Meeting Not Found</h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              We couldn't find that meeting. Check the meeting ID and try again.
            </p>
            <p className="text-[11px] font-mono text-slate-500 mt-1">ID: {cleanRoomId}</p>
          </div>
          <div className="pt-2">
            <Button
              onClick={() => navigate('/')}
              variant="primary"
              size="md"
              fullWidth
              icon={ArrowLeft}
            >
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Unauthorized State
  if (roomState === 'unauthorized') {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4 select-none">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Sign In Required</h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Please sign in to continue to CloudMeet video room.
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => navigate('/')}
              variant="secondary"
              size="md"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={() => navigate('/login')}
              variant="primary"
              size="md"
              className="flex-1"
            >
              Sign In
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 5. Network Error or Generic Error
  if (roomState === 'network_error' || roomState === 'error') {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4 select-none">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <Wifi className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Connection Issue</h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              {errorMessage || "We couldn't reach CloudMeet. Please check your connection and try again."}
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => navigate('/')}
              variant="secondary"
              size="md"
              className="flex-1"
            >
              Home
            </Button>
            <Button
              onClick={() => window.location.reload()}
              variant="primary"
              size="md"
              className="flex-1"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // 6. ACTIVE JOINED MEETING ROOM VIEW (REAL WEBRTC + COLLABORATION)
  // ========================================================
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col meeting-viewport text-slate-100 select-none bg-slate-950 relative">
      
      {/* 0. FLOATING TOAST NOTIFICATIONS */}
      {toasts.length > 0 && (
        <div className="fixed top-18 inset-x-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium backdrop-blur-xl shadow-xl border animate-in slide-in-from-top-2 duration-200 ${
                toast.type === 'error'
                  ? 'bg-rose-950/90 text-rose-200 border-rose-800/80 shadow-rose-950/50'
                  : toast.type === 'warning'
                  ? 'bg-amber-950/90 text-amber-200 border-amber-800/80 shadow-amber-950/50'
                  : toast.type === 'screenshare'
                  ? 'bg-indigo-950/90 text-indigo-200 border-indigo-700/80 shadow-indigo-950/50'
                  : 'bg-slate-900/90 text-slate-200 border-slate-700/80 shadow-black/40'
              }`}
            >
              {toast.type === 'screenshare' && <ScreenShare className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
              {toast.type === 'warning' && <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              {toast.type === 'join' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              {toast.type === 'leave' && <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              {toast.type === 'info' && <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
              <span>{toast.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* 1. TOP BAR */}
      <header className="h-14 sm:h-16 px-3 sm:px-6 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 flex items-center justify-between z-30 shrink-0">
        {/* Left: Logo & Room details */}
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <Logo size="sm" isDark={true} />

          <div className="hidden xs:flex items-center gap-2 pl-3 sm:pl-4 border-l border-slate-800">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white truncate max-w-[120px] sm:max-w-xs">
                {meetingData?.title || 'CloudMeet Meeting'}
              </span>
              <span className="text-[10px] font-mono text-indigo-400">
                {cleanRoomId}
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopyMeetingId}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
              title="Copy meeting code"
              aria-label="Copy meeting code"
            >
              {copiedLink ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Center: Live Connection status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-medium text-slate-300">
            <span className={`w-2 h-2 rounded-full ${connectionBadge.dotColor}`} />
            <span className="hidden sm:inline">{connectionBadge.label}</span>
            <span className="text-slate-500 font-mono text-[10px]">{connectionBadge.subLabel}</span>
          </div>

          <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-medium text-slate-400">
            <Shield className="w-3 h-3 text-indigo-400" />
            <span>P2P WebRTC</span>
          </div>
        </div>

        {/* Right: Quick actions & participant count */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShareMeeting}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 text-xs font-medium text-indigo-300 hover:text-white transition-colors border border-indigo-500/30"
            title="Invite others"
            aria-label="Share meeting invitation"
          >
            <Share2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Invite</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsParticipantsOpen(!isParticipantsOpen);
              if (isChatOpen) setIsChatOpen(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              isParticipantsOpen
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/60'
            }`}
            aria-label="Toggle participants list"
            title="Participants list"
          >
            <Users className="w-3.5 h-3.5" />
            <span>{totalParticipantCount}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsChatOpen(!isChatOpen);
              if (isParticipantsOpen) setIsParticipantsOpen(false);
            }}
            className={`p-2 rounded-lg transition-colors border relative ${
              isChatOpen
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/60'
            }`}
            aria-label="Toggle chat panel"
            title="Meeting chat"
          >
            <MessageSquare className="w-4 h-4" />
            {unreadCount > 0 && !isChatOpen && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-slate-900 animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE AREA: VIDEO STAGE / GRID + SIDE PANELS */}
      <div className="flex-1 relative flex overflow-hidden">
        
        {/* Main Workspace (Stage / Grid) */}
        <div className="flex-1 p-2 sm:p-4 md:p-6 flex flex-col justify-center items-center overflow-y-auto">
          
          {/* Media Permission Warning Banner */}
          {mediaError && !dismissMediaBanner && (
            <div className="w-full max-w-5xl mb-3 py-2 px-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{mediaError}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={retryMedia}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold transition-colors text-[11px]"
                >
                  Retry Permission
                </button>
                <button
                  type="button"
                  onClick={() => setDismissMediaBanner(true)}
                  className="p-1 text-slate-400 hover:text-white"
                  title="Dismiss notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 2A. PROMINENT SCREEN SHARE LAYOUT (WHEN SOMEONE IS SHARING) */}
          {/* ======================================================== */}
          {activeScreenShare ? (
            <div className="w-full h-full max-w-6xl flex flex-col gap-3 min-h-0">
              
              {/* Featured Screen Share Stage */}
              <div className="flex-1 relative rounded-2xl overflow-hidden bg-slate-900 border border-indigo-500/40 shadow-2xl flex flex-col min-h-0">
                
                {/* Stage Header Info Bar */}
                <div className="h-10 px-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between shrink-0 z-10">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                    <span>
                      {activeScreenShare.isSelf
                        ? 'You are presenting your screen'
                        : `Presenting: ${activeScreenShare.name}'s screen`}
                    </span>
                  </div>

                  {activeScreenShare.isSelf && (
                    <button
                      type="button"
                      onClick={stopScreenShare}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-semibold transition-colors shadow-xs"
                    >
                      <X className="w-3 h-3" />
                      <span>Stop Sharing</span>
                    </button>
                  )}
                </div>

                {/* Featured Video Element */}
                <div className="flex-1 bg-black flex items-center justify-center min-h-0">
                  <video
                    ref={screenShareVideoRef}
                    autoPlay
                    playsInline
                    muted={activeScreenShare.isSelf}
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>

              {/* Participant Camera Strip (All Participants remain visible) */}
              <div className="h-32 sm:h-36 shrink-0 flex items-center gap-3 overflow-x-auto pb-1 pt-0.5">
                {/* Self camera thumbnail */}
                <div className="h-full aspect-video shrink-0">
                  <VideoTile
                    key="stage-self"
                    name={`${currentUserName} (You)`}
                    role={isHost ? 'Host' : 'Participant'}
                    stream={localStream}
                    isSelf={true}
                    isMuted={!microphoneEnabled}
                    isVideoOff={!cameraEnabled}
                    isScreenSharing={isScreenSharing}
                    avatarBg={AVATAR_PALETTES[0]}
                    connectionState={rtcStatus === 'connected' ? 'connected' : 'connecting'}
                    className="w-full h-full"
                  />
                </div>

                {/* Remote camera thumbnails */}
                {remoteTiles.map((remote, idx) => {
                  const avatarPalette = AVATAR_PALETTES[(idx + 1) % AVATAR_PALETTES.length];
                  return (
                    <div key={`stage-${remote.id}`} className="h-full aspect-video shrink-0">
                      <VideoTile
                        name={remote.name}
                        role={remote.role === 'host' ? 'Host' : 'Participant'}
                        stream={remote.stream}
                        isSelf={false}
                        isMuted={remote.isMuted}
                        isVideoOff={remote.isVideoOff || !remote.stream}
                        isScreenSharing={remote.isScreenSharing}
                        avatarBg={avatarPalette}
                        connectionState={remote.connectionState}
                        className="w-full h-full"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ======================================================== */
            /* 2B. NORMAL RESPONSIVE VIDEO GRID (NO ACTIVE SCREEN SHARE) */
            /* ======================================================== */
            <div
              className={`w-full h-full max-w-6xl grid gap-2.5 sm:gap-4 place-content-center ${
                totalParticipantCount <= 1
                  ? 'grid-cols-1 max-w-3xl'
                  : totalParticipantCount === 2
                  ? 'grid-cols-1 sm:grid-cols-2 max-w-5xl'
                  : totalParticipantCount <= 4
                  ? 'grid-cols-1 sm:grid-cols-2 max-w-5xl'
                  : 'grid-cols-2 sm:grid-cols-3 max-w-6xl'
              }`}
            >
              {/* 1. Self Local Camera Preview */}
              <VideoTile
                key="local-user"
                name={`${currentUserName} (You)`}
                role={isHost ? 'Host' : 'Participant'}
                stream={localStream}
                isSelf={true}
                isMuted={!microphoneEnabled}
                isVideoOff={!cameraEnabled}
                isScreenSharing={isScreenSharing}
                avatarBg={AVATAR_PALETTES[0]}
                connectionState={rtcStatus === 'connected' ? 'connected' : 'connecting'}
                className="w-full h-full min-h-[170px] sm:min-h-[220px] md:min-h-[260px] aspect-video"
              />

              {/* 2. Remote Participants (Live WebRTC Streams) */}
              {remoteTiles.map((remote, index) => {
                const avatarPalette = AVATAR_PALETTES[(index + 1) % AVATAR_PALETTES.length];
                const roleDisplay = remote.role === 'host' ? 'Host' : 'Participant';

                return (
                  <VideoTile
                    key={remote.id}
                    name={remote.name}
                    role={roleDisplay}
                    stream={remote.stream}
                    isSelf={false}
                    isMuted={remote.isMuted}
                    isVideoOff={remote.isVideoOff || !remote.stream}
                    isScreenSharing={remote.isScreenSharing}
                    avatarBg={avatarPalette}
                    connectionState={remote.connectionState}
                    className="w-full h-full min-h-[170px] sm:min-h-[220px] md:min-h-[260px] aspect-video"
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* 3. SIDE PANEL: REAL-TIME IN-MEETING CHAT (PART 6) */}
        {/* ======================================================== */}
        {isChatOpen && (
          <aside className="w-full sm:w-80 md:w-96 bg-slate-900 border-l border-slate-800 flex flex-col z-40 animate-in slide-in-from-right duration-200 shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-bold text-white">Meeting Chat</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chat notice */}
            <div className="px-4 py-2 bg-slate-950/60 text-[11px] text-slate-400 border-b border-slate-800/80">
              Messages are visible to participants during this call.
            </div>

            {/* Messages list */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-500">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <h3 className="text-xs font-semibold text-slate-300">No messages yet</h3>
                  <p className="text-[11px] text-slate-500 max-w-[200px] leading-relaxed">
                    Start the conversation with everyone in the meeting.
                  </p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">{msg.sender}</span>
                      <span>{msg.time}</span>
                    </div>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed break-words ${
                        msg.isSelf
                          ? 'bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-600/20'
                          : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700/60'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatMessagesEndRef} />
            </div>

            {/* Chat composer box */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-950/60">
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder="Send a message to everyone..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  maxLength={2000}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="absolute right-1.5 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white transition-colors"
                  aria-label="Send message"
                  title="Send message"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </aside>
        )}

        {/* ======================================================== */}
        {/* 4. SIDE PANEL: PARTICIPANTS WITH LIVE MEDIA STATES (PART 6) */}
        {/* ======================================================== */}
        {isParticipantsOpen && (
          <aside className="w-full sm:w-80 md:w-96 bg-slate-900 border-l border-slate-800 flex flex-col z-40 animate-in slide-in-from-right duration-200 shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-bold text-white">
                  People ({totalParticipantCount})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsParticipantsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close participants"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Share Room link button */}
            <div className="p-3 border-b border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={handleShareMeeting}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 text-xs font-semibold transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{copiedLink ? 'Link Copied!' : 'Invite Others'}</span>
              </button>
              <button
                type="button"
                onClick={handleCopyMeetingId}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition-colors"
                title="Copy Meeting Code"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Active Participants list */}
            <div className="flex-1 p-3 overflow-y-auto divide-y divide-slate-800/60">
              {/* Local user entry */}
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-full bg-gradient-to-tr ${AVATAR_PALETTES[0]} text-white font-bold text-xs flex items-center justify-center`}
                  >
                    {currentUserName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-200">
                        {currentUserName}
                      </span>
                      <span className="text-[10px] text-indigo-300 font-bold bg-indigo-950 px-1 rounded">
                        You
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 capitalize">
                      {isHost ? 'Host' : 'Participant'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {isScreenSharing && (
                    <span className="p-1 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60" title="Sharing screen">
                      <ScreenShare className="w-3.5 h-3.5" />
                    </span>
                  )}
                  <div className="p-1 text-slate-400">
                    {!microphoneEnabled ? (
                      <MicOff className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </div>
                  <div className="p-1 text-slate-400">
                    {!cameraEnabled ? (
                      <VideoOff className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <Video className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Remote users with live synchronized media state */}
              {remoteTiles.map((remote, idx) => {
                const pName = remote.name;
                const pRole = remote.role;
                const avatarPalette = AVATAR_PALETTES[(idx + 1) % AVATAR_PALETTES.length];
                const initials = pName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <div key={remote.id} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-full bg-gradient-to-tr ${avatarPalette} text-white font-bold text-xs flex items-center justify-center`}
                      >
                        {initials}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-200">
                            {pName}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 capitalize">{pRole}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {remote.isScreenSharing && (
                        <span className="p-1 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60" title="Sharing screen">
                          <ScreenShare className="w-3.5 h-3.5" />
                        </span>
                      )}
                      <div className="p-1 text-slate-400">
                        {remote.isMuted ? (
                          <MicOff className="w-3.5 h-3.5 text-rose-400" />
                        ) : (
                          <Mic className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </div>
                      <div className="p-1 text-slate-400">
                        {remote.isVideoOff ? (
                          <VideoOff className="w-3.5 h-3.5 text-rose-400" />
                        ) : (
                          <Video className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

      </div>

      {/* 5. BOTTOM CONTROL BAR */}
      <MeetingControls
        isMuted={!microphoneEnabled}
        onToggleMic={toggleMicrophone}
        isVideoOff={!cameraEnabled}
        onToggleVideo={toggleCamera}
        isScreenSharing={isScreenSharing}
        onToggleScreenShare={toggleScreenShare}
        isChatOpen={isChatOpen}
        onToggleChat={() => {
          setIsChatOpen(!isChatOpen);
          if (isParticipantsOpen) setIsParticipantsOpen(false);
        }}
        isParticipantsOpen={isParticipantsOpen}
        onToggleParticipants={() => {
          setIsParticipantsOpen(!isParticipantsOpen);
          if (isChatOpen) setIsChatOpen(false);
        }}
        unreadMessagesCount={unreadCount}
        participantCount={totalParticipantCount}
        onLeaveMeeting={() => setShowLeaveModal(true)}
        isHost={isHost}
        onEndMeeting={() => setShowEndModal(true)}
        onOpenInfo={() => setShowInfoModal(true)}
      />

      {/* 6. MEETING DETAILS / INFO MODAL */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Meeting Info</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 text-[11px] block">Title</span>
                <span className="font-semibold text-slate-200">{meetingData?.title || 'CloudMeet Call'}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Meeting ID</span>
                <div className="flex items-center justify-between mt-1 p-2 rounded-xl bg-slate-800 border border-slate-700">
                  <span className="font-mono font-bold text-indigo-400 text-sm">{cleanRoomId}</span>
                  <button
                    type="button"
                    onClick={handleCopyMeetingId}
                    className="p-1 text-slate-400 hover:text-white"
                    title="Copy code"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Direct URL</span>
                <span className="font-mono text-[10px] text-slate-300 break-all block mt-0.5">
                  {window.location.origin}/meeting/{cleanRoomId}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="primary"
                size="sm"
                fullWidth
                onClick={handleShareMeeting}
                icon={Share2}
              >
                Share Invitation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 7. LEAVE MEETING MODAL */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
              <PhoneOff className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-white">Leave this meeting?</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your camera, microphone, and screen share will disconnect. You can rejoin at any time using code {cleanRoomId}.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                disabled={isLeaving}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLeaveConfirm}
                disabled={isLeaving}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-md shadow-rose-600/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isLeaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Leaving...
                  </>
                ) : (
                  'Leave'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. HOST END MEETING MODAL */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
              <Power className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-white">End meeting for everyone?</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              As host, ending this meeting will disconnect all active participants, release all media sessions, and mark the room as concluded.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                disabled={isEnding}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEndConfirm}
                disabled={isEnding}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-md shadow-rose-600/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isEnding ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Ending...
                  </>
                ) : (
                  'End for All'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
