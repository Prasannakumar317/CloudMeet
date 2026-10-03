import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  MessageSquare,
  Users,
  PhoneOff,
  Settings,
  Maximize2,
  Power,
  Info,
} from 'lucide-react';

export default function MeetingControls({
  isMuted,
  onToggleMic,
  isVideoOff,
  onToggleVideo,
  isScreenSharing = false,
  onToggleScreenShare,
  isChatOpen,
  onToggleChat,
  isParticipantsOpen,
  onToggleParticipants,
  unreadMessagesCount = 0,
  participantCount = 1,
  onLeaveMeeting,
  isHost = false,
  onEndMeeting,
  onOpenInfo,
}) {
  return (
    <div className="w-full flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 bg-slate-900/90 backdrop-blur-xl border-t border-slate-800/80 text-white z-40 select-none">
      {/* Left section: Info or room status */}
      <div className="hidden lg:flex items-center gap-3 w-1/4">
        <span className="text-xs text-slate-400 font-medium">CloudMeet Secure Mesh</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        {onOpenInfo && (
          <button
            type="button"
            onClick={onOpenInfo}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Meeting details"
            aria-label="View meeting details"
          >
            <Info className="w-3.5 h-3.5 text-indigo-400" />
            <span>Details</span>
          </button>
        )}
      </div>

      {/* Center section: Main Control Buttons */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 flex-1 lg:flex-initial">
        {/* Microphone Button */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={onToggleMic}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 p-2.5 sm:px-4 sm:py-2.5 rounded-xl font-medium text-xs transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 active:scale-95 ${
              isMuted
                ? 'bg-rose-600/90 hover:bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="w-5 h-5 sm:w-4.5 sm:h-4.5" /> : <Mic className="w-5 h-5 sm:w-4.5 sm:h-4.5 text-emerald-400" />}
            <span className="hidden sm:inline">{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>
        </div>

        {/* Camera Button */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={onToggleVideo}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 p-2.5 sm:px-4 sm:py-2.5 rounded-xl font-medium text-xs transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 active:scale-95 ${
              isVideoOff
                ? 'bg-rose-600/90 hover:bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60'
            }`}
            title={isVideoOff ? 'Start camera' : 'Stop camera'}
            aria-label={isVideoOff ? 'Start camera' : 'Stop camera'}
          >
            {isVideoOff ? <VideoOff className="w-5 h-5 sm:w-4.5 sm:h-4.5" /> : <Video className="w-5 h-5 sm:w-4.5 sm:h-4.5 text-emerald-400" />}
            <span className="hidden sm:inline">{isVideoOff ? 'Start Video' : 'Stop Video'}</span>
          </button>
        </div>

        {/* Screen Share Button */}
        <button
          type="button"
          onClick={onToggleScreenShare}
          className={`flex flex-col sm:flex-row items-center justify-center gap-1 p-2.5 sm:px-4 sm:py-2.5 rounded-xl font-medium text-xs transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 active:scale-95 ${
            isScreenSharing
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400 animate-pulse'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60'
          }`}
          title={isScreenSharing ? 'Stop sharing screen' : 'Share your screen'}
          aria-label={isScreenSharing ? 'Stop sharing screen' : 'Share your screen'}
        >
          <ScreenShare className={`w-5 h-5 sm:w-4.5 sm:h-4.5 ${isScreenSharing ? 'text-white' : 'text-indigo-400'}`} />
          <span className="hidden sm:inline">{isScreenSharing ? 'Stop Sharing' : 'Share'}</span>
        </button>

        {/* Chat Button */}
        <button
          type="button"
          onClick={onToggleChat}
          className={`relative flex flex-col sm:flex-row items-center justify-center gap-1 p-2.5 sm:px-4 sm:py-2.5 rounded-xl font-medium text-xs transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 active:scale-95 ${
            isChatOpen
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60'
          }`}
          title={isChatOpen ? 'Close chat' : 'Open in-call chat'}
          aria-label={isChatOpen ? 'Close chat' : 'Open in-call chat'}
        >
          <MessageSquare className="w-5 h-5 sm:w-4.5 sm:h-4.5 text-indigo-300" />
          <span className="hidden sm:inline">Chat</span>
          {unreadMessagesCount > 0 && !isChatOpen && (
            <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-slate-900 animate-bounce">
              {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
            </span>
          )}
        </button>

        {/* Participants Button */}
        <button
          type="button"
          onClick={onToggleParticipants}
          className={`flex flex-col sm:flex-row items-center justify-center gap-1 p-2.5 sm:px-4 sm:py-2.5 rounded-xl font-medium text-xs transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 active:scale-95 ${
            isParticipantsOpen
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60'
          }`}
          title={isParticipantsOpen ? 'Close participants list' : 'View participants'}
          aria-label={isParticipantsOpen ? 'Close participants list' : 'View participants'}
        >
          <Users className="w-5 h-5 sm:w-4.5 sm:h-4.5 text-indigo-300" />
          <span className="hidden sm:inline">People</span>
          <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300 font-semibold">
            {participantCount}
          </span>
        </button>

        {/* Leave Meeting Button (Always available to all participants) */}
        <button
          type="button"
          onClick={onLeaveMeeting}
          className="flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 active:scale-95 ml-1 sm:ml-2"
          title="Leave meeting"
          aria-label="Leave meeting"
        >
          <PhoneOff className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-rose-400" />
          <span className="hidden xs:inline">Leave</span>
        </button>

        {/* End Meeting Button (Host Only) */}
        {isHost && onEndMeeting && (
          <button
            type="button"
            onClick={onEndMeeting}
            className="flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/30 hover:shadow-rose-600/40 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 active:scale-95 ml-1"
            title="End meeting for everyone"
            aria-label="End meeting for everyone"
          >
            <Power className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            <span className="hidden sm:inline">End for All</span>
            <span className="sm:hidden">End</span>
          </button>
        )}
      </div>

      {/* Right section: More options */}
      <div className="hidden lg:flex items-center justify-end gap-2 w-1/4">
        <button
          type="button"
          className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700/60"
          title="Toggle Fullscreen"
          aria-label="Toggle Fullscreen"
          onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen().catch(() => {});
            } else {
              document.exitFullscreen().catch(() => {});
            }
          }}
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
