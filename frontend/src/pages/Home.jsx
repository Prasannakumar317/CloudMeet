import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  ScreenShare,
  MessageSquare,
  Shield,
  Cloud,
  Volume2,
  Users,
  ArrowRight,
  Sparkles,
  PhoneCall,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import Button from '../components/Button';
import FeatureCard from '../components/FeatureCard';
import RecentMeetings from '../components/RecentMeetings';
import { useAuth } from '../context/AuthContext';
import { createMeeting, joinMeeting, checkHealth } from '../services/api';


export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [meetingCode, setMeetingCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Create meeting modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [createError, setCreateError] = useState('');

  // Proactively ping health endpoint on landing to wake sleeping backend if inactive
  React.useEffect(() => {
    checkHealth().catch(() => {});
  }, []);

  // Handle Create Meeting button click
  const handleOpenCreateMeeting = () => {
    if (!user) {
      navigate('/login');
      return;
    }
    setMeetingTitle('');
    setCreateError('');
    setIsWarmingUp(false);
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e) => {
    e?.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }

    setIsCreating(true);
    setIsWarmingUp(false);
    setCreateError('');

    // If request takes longer than 4s, inform user that cloud instance is waking up
    const warmUpTimer = setTimeout(() => {
      setIsWarmingUp(true);
    }, 4000);

    try {
      const response = await createMeeting(meetingTitle.trim() || 'CloudMeet Meeting');
      clearTimeout(warmUpTimer);
      if (response?.room_id) {
        setShowCreateModal(false);
        navigate(`/meeting/${response.room_id}`);
      } else {
        throw new Error('No room ID returned from server.');
      }
    } catch (err) {
      clearTimeout(warmUpTimer);
      console.error('[Home] Failed to create meeting:', {
        status: err.status,
        duration: err.durationMs,
        receivedResponse: err.receivedResponse,
        message: err.message,
      });
      setCreateError(err.message || 'Something went wrong while processing the meeting.');
    } finally {
      clearTimeout(warmUpTimer);
      setIsCreating(false);
      setIsWarmingUp(false);
    }
  };

  // Handle Join Meeting button click
  const handleJoinMeeting = async (e) => {
    e?.preventDefault();
    const raw = meetingCode.trim();
    if (!raw) return;

    // Normalize room ID: extract from URL if pasted, trim, uppercase
    const cleanCode = raw.replace(/^https?:\/\/[^/]+\/meeting\//i, '').trim().toUpperCase();

    if (!cleanCode) return;

    if (!user) {
      navigate('/login');
      return;
    }

    setIsJoining(true);
    setJoinError('');

    try {
      const response = await joinMeeting(cleanCode);
      if (response?.room_id) {
        navigate(`/meeting/${response.room_id}`);
      }
    } catch (err) {
      console.error('[Home] Failed to join meeting:', err);
      if (err.status === 404) {
        setJoinError("We couldn't find that meeting. Check the meeting ID and try again.");
      } else if (err.status === 400 && err.message?.toLowerCase().includes('ended')) {
        setJoinError('This meeting has already ended.');
      } else if (err.status === 401) {
        setJoinError('Please sign in to continue.');
      } else if (err.status === 0 || err.message?.includes('reach CloudMeet')) {
        setJoinError("We couldn't reach CloudMeet. Please check your connection and try again.");
      } else {
        setJoinError(err.message || 'Something went wrong while processing the meeting.');
      }
    } finally {
      setIsJoining(false);
    }
  };


  return (
    <div className="relative overflow-hidden">
      {/* Background Glow Accents */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-indigo-500/10 via-purple-500/10 to-blue-500/10 blur-3xl pointer-events-none -z-10" />

      {/* Hero Section */}
      <section className="pt-8 pb-16 sm:pt-14 sm:pb-24 lg:pt-20 lg:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Left Column: Hero Content */}
            <div className="lg:col-span-6 space-y-6 sm:space-y-8 text-center lg:text-left">
              {/* Product Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 shadow-xs text-xs font-semibold text-slate-800">
                <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  CloudMeet 1.0 Preview
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-500 font-normal">Next-Gen Video Platform</span>
              </div>

              {/* Main Heading */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
                Connect.{' '}
                <span className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 bg-clip-text text-transparent">
                  Collaborate.
                </span>{' '}
                Anywhere.
              </h1>

              {/* Supporting Text */}
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto lg:mx-0">
                Experience frictionless, browser-based video meetings engineered for crystal-clear real-time communication. No bulky software installations, just seamless collaboration right from your web browser.
              </p>

              {/* Action Buttons & Quick Join Input */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4">
                  <Button
                    onClick={handleOpenCreateMeeting}
                    size="lg"
                    icon={Video}
                    variant="primary"
                    className="w-full sm:w-auto"
                  >
                    Create a Meeting
                  </Button>

                  <div className="flex w-full sm:w-auto items-center gap-2">
                    <div className="relative flex-1 sm:w-56">
                      <input
                        type="text"
                        placeholder="Enter room code..."
                        value={meetingCode}
                        onChange={(e) => {
                          setMeetingCode(e.target.value);
                          if (joinError) setJoinError('');
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleJoinMeeting()}
                        disabled={isJoining}
                        className="w-full pl-3.5 pr-2 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-xs uppercase tracking-wider font-mono disabled:opacity-60"
                      />
                    </div>
                    <Button
                      onClick={handleJoinMeeting}
                      variant="secondary"
                      size="lg"
                      disabled={!meetingCode.trim() || isJoining}
                      className="whitespace-nowrap"
                    >
                      {isJoining ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Joining...
                        </span>
                      ) : (
                        'Join'
                      )}
                    </Button>
                  </div>
                </div>

                {/* Friendly Join Error Alert */}
                {joinError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-left animate-in fade-in duration-200">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                    <span className="flex-1 font-medium">{joinError}</span>
                    <button
                      type="button"
                      onClick={() => setJoinError('')}
                      className="text-rose-400 hover:text-rose-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Key Trust Signals */}
              <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-6 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Free instant meetings
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  No downloads needed
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  End-to-end encrypted rooms
                </span>
              </div>
            </div>

            {/* Right Column: High-Fidelity Video Conferencing Mockup */}
            <div className="lg:col-span-6 relative">
              {/* Outer decorative card frame with glassmorphism */}
              <div className="relative rounded-3xl bg-slate-900 p-3 sm:p-5 shadow-2xl shadow-indigo-950/20 border border-slate-800/90 text-white">
                
                {/* Mock Header Bar */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 text-xs mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                    </div>
                    <span className="font-semibold text-slate-300 ml-2">CloudMeet Room: design-sync-prod</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-emerald-400 font-medium px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/60 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      00:24:18
                    </span>
                  </div>
                </div>

                {/* Mock Video Grid (4 Participants) */}
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 aspect-[4/3] sm:aspect-[16/10]">
                  
                  {/* Tile 1: Active Speaker */}
                  <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-slate-800 to-indigo-950/80 border-2 border-emerald-500/70 p-3 flex flex-col justify-between shadow-md">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Speaking
                      </span>
                      <span className="text-slate-400 font-mono">1080p</span>
                    </div>

                    <div className="flex flex-col items-center justify-center my-auto">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-base sm:text-xl shadow-lg ring-2 ring-white/20">
                        SC
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg">
                      <span className="font-medium text-slate-200 truncate">Sarah Chen</span>
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  </div>

                  {/* Tile 2: Participant */}
                  <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-800 p-3 flex flex-col justify-between shadow-md">
                    <div className="flex justify-end">
                      <span className="text-[10px] text-slate-400 font-mono">1080p</span>
                    </div>

                    <div className="flex flex-col items-center justify-center my-auto">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-base sm:text-xl shadow-lg ring-2 ring-white/20">
                        AR
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg">
                      <span className="font-medium text-slate-200 truncate">Alex Rivera</span>
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  </div>

                  {/* Tile 3: Muted Participant */}
                  <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-800 p-3 flex flex-col justify-between shadow-md">
                    <div className="flex justify-end">
                      <span className="text-[10px] text-slate-400 font-mono">1080p</span>
                    </div>

                    <div className="flex flex-col items-center justify-center my-auto">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-base sm:text-xl shadow-lg ring-2 ring-white/20">
                        MV
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg">
                      <span className="font-medium text-slate-200 truncate">Marcus Vance</span>
                      <MicOff className="w-3.5 h-3.5 text-rose-400" />
                    </div>
                  </div>

                  {/* Tile 4: Self User */}
                  <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-slate-800 via-indigo-950/40 to-slate-900 border border-slate-800 p-3 flex flex-col justify-between shadow-md">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[10px] uppercase font-bold text-indigo-300 bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-800/60">
                        You
                      </span>
                      <span className="text-slate-400 font-mono">1080p</span>
                    </div>

                    <div className="flex flex-col items-center justify-center my-auto">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-base sm:text-xl shadow-lg ring-2 ring-white/20">
                        ER
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg">
                      <span className="font-medium text-slate-200 truncate">Elena (Host)</span>
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  </div>

                </div>

                {/* Floating Mock Control Bar */}
                <div className="mt-3 py-2 px-3 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
                      <Mic className="w-3.5 h-3.5" />
                    </div>
                    <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
                      <Video className="w-3.5 h-3.5" />
                    </div>
                    <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
                      <ScreenShare className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
                      <MessageSquare className="w-3.5 h-3.5" />
                    </div>
                    <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <div className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-semibold">
                      Leave
                    </div>
                  </div>
                </div>

                {/* Floating quick action pill */}
                <div className="absolute -bottom-4 -left-4 hidden sm:flex items-center gap-3 bg-white/95 text-slate-900 px-4 py-2.5 rounded-2xl shadow-xl border border-slate-200/80 backdrop-blur-md">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold">Fast & Low Latency</p>
                    <p className="text-[11px] text-slate-500">Adaptive WebRTC Streaming</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Recent Meetings Section (for Authenticated Users) */}
      <RecentMeetings user={user} />

      {/* Features Section */}
      <section id="features" className="py-20 sm:py-24 bg-white/60 border-t border-slate-200/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-2.5">
              Enterprise Grade Capabilities
            </h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Engineered for seamless conversations
            </p>
            <p className="mt-3.5 text-base sm:text-lg text-slate-600">
              Everything required for productive meetings, crystal clear standups, and collaborative team sessions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            <FeatureCard
              icon={Video}
              title="HD Video"
              description="High-definition video rendering with dynamic bitrate adjustment for stutter-free visuals, even on fluctuating connections."
              badgeText="1080p Ultra"
              accentBg="bg-blue-50 text-blue-600"
            />

            <FeatureCard
              icon={Volume2}
              title="Crystal-clear Audio"
              description="Noise suppression and acoustic echo cancellation ensure every team member is heard with pristine fidelity."
              badgeText="Acoustic Clean"
              accentBg="bg-indigo-50 text-indigo-600"
            />

            <FeatureCard
              icon={ScreenShare}
              title="Screen Sharing"
              description="Share entire screens, individual browser tabs, or specific application windows with smooth frame rates."
              badgeText="Low Latency"
              accentBg="bg-violet-50 text-violet-600"
            />

            <FeatureCard
              icon={MessageSquare}
              title="Meeting Chat"
              description="Real-time in-meeting messaging to exchange links, ask questions, and share notes without interrupting the speaker."
              badgeText="Instant Sync"
              accentBg="bg-emerald-50 text-emerald-600"
            />

            <FeatureCard
              icon={Shield}
              title="Secure Rooms"
              description="Protected rooms with end-to-end media encryption, customizable access tokens, and host controls."
              badgeText="Encrypted"
              accentBg="bg-amber-50 text-amber-600"
            />

            <FeatureCard
              icon={Cloud}
              title="Cloud Access"
              description="Join instantly from any modern web browser across Windows, macOS, Linux, iOS, or Android without setup."
              badgeText="Zero Install"
              accentBg="bg-sky-50 text-sky-600"
            />
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-2.5">
              Simple Workflow
            </h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Start meeting in three simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Step 1 */}
            <div className="relative bg-white rounded-2xl p-8 border border-slate-200/80 shadow-xs flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 font-extrabold text-xl flex items-center justify-center mb-6 shadow-xs border border-indigo-100">
                1
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Create or Join a Meeting</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Click create to launch an instant room with a unique room ID, or type in a code sent by your colleague.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative bg-white rounded-2xl p-8 border border-slate-200/80 shadow-xs flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 font-extrabold text-xl flex items-center justify-center mb-6 shadow-xs border border-indigo-100">
                2
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Share the Meeting ID</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Copy the direct room link or share the short room ID with team members, guests, or clients.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative bg-white rounded-2xl p-8 border border-slate-200/80 shadow-xs flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 font-extrabold text-xl flex items-center justify-center mb-6 shadow-xs border border-indigo-100">
                3
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Start Communicating</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Enable your microphone and camera, share presentations, and collaborate with zero friction.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Compact CTA Section */}
      <section id="about" className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-violet-900 text-white p-8 sm:p-12 shadow-2xl overflow-hidden">
            {/* Subtle background glow */}
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
              <div className="space-y-3 max-w-xl">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  Ready to collaborate?
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Experience seamless cloud meetings today
                </h2>
                <p className="text-sm sm:text-base text-indigo-100/90 leading-relaxed">
                  Join thousands of teams collaborating efficiently with CloudMeet. No credit card required.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                <Button
                  to="/meeting/demo-room"
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto bg-white text-indigo-900 hover:bg-slate-100 hover:text-indigo-950 shadow-none font-bold"
                >
                  Try Demo Room
                </Button>
                <Button
                  to="/signup"
                  variant="dark"
                  size="lg"
                  className="w-full sm:w-auto bg-indigo-950/70 border-indigo-700/60 text-white hover:bg-indigo-950"
                >
                  Create Account
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Create Meeting Setup Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 relative">
            <button
              type="button"
              onClick={() => !isCreating && setShowCreateModal(false)}
              disabled={isCreating}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100/80">
                <Video className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Start a New Meeting</h3>
                <p className="text-xs text-slate-500">You will be assigned as the meeting host</p>
              </div>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 pt-1">
              <div>
                <label htmlFor="meeting-title" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Meeting Title (Optional)
                </label>
                <input
                  id="meeting-title"
                  type="text"
                  placeholder="e.g. Project Discussion, Weekly Standup"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  maxLength={120}
                  disabled={isCreating}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                  autoFocus
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Leave blank to use default "CloudMeet Meeting"
                </p>
              </div>

              {isCreating && isWarmingUp && (
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-700 font-medium flex items-center gap-2 animate-in fade-in">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
                  <span>Connecting to cloud server (waking up instance, please wait)...</span>
                </div>
              )}

              {createError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                  {createError}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreating}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isCreating}
                  className="flex-1"
                >
                  {isCreating ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    'Launch Meeting'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

