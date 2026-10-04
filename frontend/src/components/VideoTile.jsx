import React, { useRef, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, Pin, MoreHorizontal, Wifi, ScreenShare } from 'lucide-react';

export default function VideoTile({
  name,
  role,
  isMuted = false,
  isVideoOff = false,
  isScreenSharing = false,
  isSpeaking = false,
  isPinned = false,
  isSelf = false,
  avatarBg = 'from-blue-600 to-indigo-700',
  stream = null,
  connectionState = 'connected',
  className = '',
}) {
  const videoRef = useRef(null);

  // Attach and play the actual live WebRTC MediaStream
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (stream) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.debug('[VideoTile] Video play hindered by autoplay policy:', err);
        });
      }

      // Re-trigger playback if new tracks arrive dynamically
      const handleTrackChange = () => {
        if (videoEl && stream) {
          if (videoEl.srcObject !== stream) {
            videoEl.srcObject = stream;
          }
          videoEl.play().catch(() => {});
        }
      };

      stream.addEventListener('addtrack', handleTrackChange);
      stream.addEventListener('removetrack', handleTrackChange);

      return () => {
        stream.removeEventListener('addtrack', handleTrackChange);
        stream.removeEventListener('removetrack', handleTrackChange);
      };
    } else {
      videoEl.srcObject = null;
    }
  }, [stream]);

  // Extract initials from name
  const initials = name
    ? name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  // Live video is active if stream exists and either camera is on or peer is screen sharing
  const hasLiveVideo = Boolean(stream && (!isVideoOff || isScreenSharing));

  // Handle tap to unblock audio on mobile if autoplay was restricted
  const handleTileClick = () => {
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div
      onClick={handleTileClick}
      className={`group relative rounded-2xl overflow-hidden bg-slate-900 border transition-all duration-300 flex items-center justify-center select-none shadow-md ${
        isSpeaking
          ? 'ring-2 ring-emerald-400 border-emerald-400 shadow-emerald-500/20'
          : 'border-slate-800/80 hover:border-slate-700'
      } ${className}`}
    >
      {/* 1. REAL WEBRTC VIDEO/AUDIO STREAM (Never display:none so audio decoder keeps running) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        webkit-playsinline="true"
        muted={isSelf} // Always mute local stream to prevent acoustic feedback loop
        className={`transition-opacity duration-300 ${
          isScreenSharing ? 'object-contain bg-slate-950 w-full h-full' : 'object-cover w-full h-full'
        } ${hasLiveVideo ? 'opacity-100 block' : 'opacity-0 invisible absolute w-1 h-1 pointer-events-none'} ${
          isSelf && !isScreenSharing ? 'transform -scale-x-100' : ''
        }`}
      />

      {/* 2. CAMERA OFF / NO STREAM PLACEHOLDER */}
      {!hasLiveVideo && (
        <div className="absolute inset-0 w-full h-full bg-slate-900/95 flex flex-col items-center justify-center">
          <div
            className={`w-18 h-18 sm:w-22 sm:h-22 rounded-full bg-gradient-to-tr ${avatarBg} text-white font-bold text-xl sm:text-2xl flex items-center justify-center shadow-lg ring-2 ring-white/10`}
          >
            {initials}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-400 bg-slate-800/80 px-2.5 py-0.5 rounded-md border border-slate-700/60">
            <VideoOff className="w-3.5 h-3.5 text-rose-400" />
            <span>Camera turned off</span>
          </div>
        </div>
      )}

      {/* 3. TOP ACTION CONTROLS (Hover) */}
      <div className="absolute top-3 inset-x-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-slate-300 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md flex items-center gap-1">
            <Wifi className={`w-3 h-3 ${connectionState === 'connected' ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="capitalize">{connectionState === 'connected' ? 'HD' : connectionState}</span>
          </span>
          {isScreenSharing && (
            <span className="text-[10px] font-medium text-indigo-300 bg-indigo-950/80 backdrop-blur-md px-2 py-0.5 rounded-md flex items-center gap-1 border border-indigo-500/40">
              <ScreenShare className="w-3 h-3 text-indigo-400" />
              <span>Sharing</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-md transition-colors"
            title={isPinned ? 'Unpin' : 'Pin to screen'}
            aria-label="Pin participant video"
          >
            <Pin className={`w-3.5 h-3.5 ${isPinned ? 'text-indigo-400 fill-indigo-400' : ''}`} />
          </button>
          <button
            type="button"
            className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-md transition-colors"
            title="More participant options"
            aria-label="More options"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 4. BOTTOM OVERLAY: NAME, ROLE, SCREEN & MIC STATUS */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
        <div className="flex items-center gap-1.5 bg-black/65 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/10 max-w-[85%] truncate">
          <span className="text-xs sm:text-sm font-medium text-white truncate">
            {name}
          </span>
          {isSelf && (
            <span className="text-[10px] uppercase font-bold text-indigo-300 bg-indigo-950/80 px-1.5 py-0.5 rounded shrink-0">
              You
            </span>
          )}
          {role && !isSelf && (
            <span className="text-[10px] font-medium text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded capitalize shrink-0">
              {role}
            </span>
          )}
          {isScreenSharing && (
            <span className="text-[10px] font-medium text-indigo-300 bg-indigo-950 px-1.5 py-0.5 rounded flex items-center gap-1 border border-indigo-500/40 shrink-0">
              <ScreenShare className="w-3 h-3 text-indigo-400" />
              <span className="hidden xs:inline">Screen</span>
            </span>
          )}
        </div>

        {/* Microphone status badge */}
        <div
          className={`p-1.5 rounded-lg backdrop-blur-md flex items-center justify-center border shadow-xs ${
            isMuted
              ? 'bg-rose-500/90 text-white border-rose-400/40'
              : 'bg-black/60 text-emerald-400 border-white/10'
          }`}
          title={isMuted ? 'Microphone is muted' : 'Microphone is active'}
        >
          {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </div>
      </div>
    </div>
  );
}
