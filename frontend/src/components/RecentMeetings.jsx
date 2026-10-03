import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Video,
  Copy,
  Check,
  Calendar,
  AlertCircle,
  RefreshCw,
  Info,
  X,
  Shield,
  UserCheck,
} from 'lucide-react';
import { getMyMeetings } from '../services/api';
import Button from './Button';

/**
 * CloudMeet Meeting History Component (Part 7)
 * Implements Loading, Empty, Error, and Success states,
 * plus a detailed Meeting Information modal with accessible keyboard & dialog support.
 */
export default function RecentMeetings({ user }) {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedRoomId, setCopiedRoomId] = useState(null);
  const [selectedMeeting, setSelectedMeeting] = useState(null);

  const fetchMeetings = useCallback(async () => {
    if (!user) {
      setMeetings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getMyMeetings();
      setMeetings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('[RecentMeetings] Failed to load meetings:', err.message);
      setError('Unable to load meeting history. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedMeeting) {
        setSelectedMeeting(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMeeting]);

  const handleCopyId = (e, roomId) => {
    e.stopPropagation();
    if (!roomId) return;
    navigator.clipboard?.writeText(roomId);
    setCopiedRoomId(roomId);
    setTimeout(() => setCopiedRoomId(null), 2000);
  };

  const formatLocalDate = (dateStr) => {
    if (!dateStr) return 'Recently';
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  if (!user) {
    return null;
  }

  return (
    <section
      className="py-10 bg-slate-50/80 border-t border-slate-200/80"
      aria-label="Meeting history"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Meeting History</h2>
              <p className="text-xs text-slate-500">Meetings you recently created, hosted, or joined</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!loading && (
              <button
                type="button"
                onClick={fetchMeetings}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-indigo-600 hover:bg-white border border-slate-200/80 transition-all shadow-xs"
                title="Refresh meeting list"
                aria-label="Refresh meeting list"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            )}
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">
              Showing {meetings.length} {meetings.length === 1 ? 'meeting' : 'meetings'}
            </span>
          </div>
        </div>

        {/* State: Loading */}
        {loading && (
          <div className="py-8" role="status" aria-live="polite">
            <div className="flex items-center justify-center gap-2 mb-6 text-sm text-indigo-600 font-medium">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Loading your meetings...</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-36 rounded-2xl bg-white border border-slate-200/80 p-5 animate-pulse flex flex-col justify-between shadow-xs"
                >
                  <div className="space-y-2">
                    <div className="h-4 bg-slate-200 rounded w-2/3" />
                    <div className="h-3 bg-slate-100 rounded w-1/3" />
                  </div>
                  <div className="h-8 bg-slate-100 rounded w-full" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* State: Error */}
        {!loading && error && (
          <div
            className="p-6 rounded-2xl bg-rose-50/70 border border-rose-200 text-center max-w-md mx-auto"
            role="alert"
          >
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-rose-800 mb-1">
              Unable to load meeting history. Please try again.
            </p>
            <p className="text-xs text-rose-600 mb-4">
              Please check your connection and retry the request.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={fetchMeetings}
              icon={RefreshCw}
              className="border-rose-200 hover:bg-rose-100 text-rose-700"
            >
              Retry
            </Button>
          </div>
        )}

        {/* State: Empty */}
        {!loading && !error && meetings.length === 0 && (
          <div
            className="p-10 rounded-2xl bg-white border border-dashed border-slate-300 text-center max-w-md mx-auto shadow-xs"
            role="region"
            aria-label="No meetings"
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto mb-3">
              <Video className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">
              You haven't joined any meetings yet.
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              Create a new instant video room or join using an invite code.
            </p>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                const input = document.getElementById('instant-meet-title');
                if (input) input.focus();
              }}
            >
              Start a Meeting
            </Button>
          </div>
        )}

        {/* State: Success */}
        {!loading && !error && meetings.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {meetings.map((m) => {
              const isActive = m.status === 'active';
              return (
                <div
                  key={m.room_id}
                  className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-indigo-200 transition-all duration-200 flex flex-col justify-between"
                >
                  <div>
                    {/* Top Row: Title, Status, Details button */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3
                        className="text-sm font-bold text-slate-900 truncate"
                        title={m.title}
                      >
                        {m.title || 'CloudMeet Meeting'}
                      </h3>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {isActive ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active
                            </>
                          ) : (
                            'Ended'
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedMeeting(m)}
                          className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                          title="View meeting details"
                          aria-label={`View details for ${m.title || m.room_id}`}
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Room ID with copy and creation date */}
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded-md text-slate-700">
                        <span>{m.room_id}</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyId(e, m.room_id)}
                          className="hover:text-indigo-600 transition-colors p-0.5"
                          title="Copy Room ID"
                          aria-label={`Copy room ID ${m.room_id}`}
                        >
                          {copiedRoomId === m.room_id ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-400" />
                          )}
                        </button>
                      </div>

                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatLocalDate(m.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Row: Role badge and Action button */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        m.role === 'host'
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {m.role === 'host' ? 'Host' : 'Participant'}
                    </span>

                    {isActive ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => navigate(`/meeting/${m.room_id}`)}
                        className="py-1 px-3.5 text-xs font-semibold"
                        id={`join-recent-${m.room_id}`}
                      >
                        Join
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium px-2 py-1 bg-slate-50 rounded-lg border border-slate-100 select-none">
                        Ended
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Accessible Meeting Details Modal */}
        {selectedMeeting && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-details-title"
            onClick={() => setSelectedMeeting(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Video className="w-4 h-4" />
                  </div>
                  <div>
                    <h3
                      id="meeting-details-title"
                      className="text-base font-bold text-slate-900"
                    >
                      Meeting Details
                    </h3>
                    <p className="text-xs text-slate-500">Summary and session status</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMeeting(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="Close meeting details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium block mb-1">Title</span>
                  <span className="font-semibold text-slate-800 text-sm">
                    {selectedMeeting.title || 'CloudMeet Meeting'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 font-medium block mb-1">Room ID</span>
                    <div className="flex items-center justify-between font-mono text-slate-800 font-semibold">
                      <span>{selectedMeeting.room_id}</span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyId(e, selectedMeeting.room_id)}
                        className="text-indigo-600 hover:text-indigo-700 p-0.5"
                        title="Copy Room ID"
                      >
                        {copiedRoomId === selectedMeeting.room_id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 font-medium block mb-1">Status</span>
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        selectedMeeting.status === 'active'
                          ? 'text-emerald-700'
                          : 'text-slate-600'
                      }`}
                    >
                      {selectedMeeting.status === 'active' ? 'Active' : 'Ended'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 font-medium block mb-1">Your Role</span>
                    <span className="font-semibold text-slate-800 capitalize">
                      {selectedMeeting.role || 'Participant'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 font-medium block mb-1">Created At</span>
                    <span className="text-slate-700">
                      {formatLocalDate(selectedMeeting.created_at)}
                    </span>
                  </div>
                </div>

                {selectedMeeting.ended_at && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 font-medium block mb-1">Ended At</span>
                    <span className="text-slate-700">
                      {formatLocalDate(selectedMeeting.ended_at)}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelectedMeeting(null)}
                >
                  Close
                </Button>
                {selectedMeeting.status === 'active' && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setSelectedMeeting(null);
                      navigate(`/meeting/${selectedMeeting.room_id}`);
                    }}
                  >
                    Join Room
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
