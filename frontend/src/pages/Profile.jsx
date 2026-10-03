import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Calendar,
  Shield,
  Save,
  LogOut,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getCurrentUserProfile, updateUserProfile } from '../services/api';
import Button from '../components/Button';
import RecentMeetings from '../components/RecentMeetings';

/**
 * CloudMeet User Profile & Account Settings Page (Part 7)
 * Provides:
 * - Profile avatar and initials
 * - Editable display name with robust validation (trim, empty rejection, 1-100 chars)
 * - Read-only verified email
 * - Account creation timestamp (browser localized)
 * - Authentication provider badge (Google SSO vs Email)
 * - Shared, consistent account sign-out
 * - Zero exposure of internal tokens, Supabase UUIDs, or MongoDB IDs
 * - Embedded meeting history
 */
export default function Profile() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [fullName, setFullName] = useState('');
  const [mongoProfile, setMongoProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      setLoadingProfile(true);
      try {
        const data = await getCurrentUserProfile();
        if (isMounted && data) {
          setMongoProfile(data);
          const initialName =
            data.full_name ||
            user?.user_metadata?.full_name ||
            user?.email?.split('@')[0] ||
            '';
          setFullName(initialName);
        }
      } catch (err) {
        console.warn('[Profile] Could not fetch MongoDB profile:', err.message);
        if (isMounted && user) {
          const fallbackName =
            user.user_metadata?.full_name ||
            user.email?.split('@')[0] ||
            '';
          setFullName(fallbackName);
        }
      } finally {
        if (isMounted) setLoadingProfile(false);
      }
    };

    if (user) {
      loadProfile();
    }
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Derived user details
  const displayEmail = user?.email || 'No email attached';
  const provider =
    user?.app_metadata?.provider ||
    user?.identities?.[0]?.provider ||
    'email';
  const isGoogle = provider === 'google';

  const formatCreationDate = (dateStr) => {
    if (!dateStr) return 'Active Member';
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  const accountCreated =
    mongoProfile?.created_at || user?.created_at;

  const initials = (fullName || displayEmail)
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setValidationError('');
    setSuccessMessage('');
    setErrorMessage('');

    // Trim and normalize whitespace
    const cleaned = fullName.trim().replace(/\s+/g, ' ');

    if (!cleaned) {
      setValidationError('Full name cannot be empty or only spaces.');
      return;
    }

    if (cleaned.length > 100) {
      setValidationError('Full name must not exceed 100 characters.');
      return;
    }

    setSaving(true);
    try {
      // 1. Update MongoDB profile via backend PATCH
      const updated = await updateUserProfile(cleaned);
      setMongoProfile(updated);
      setFullName(updated.full_name || cleaned);

      // 2. Sync to Supabase user metadata so Navbar and local session reflect change
      if (supabase) {
        await supabase.auth.updateUser({
          data: { full_name: cleaned },
        });
      }

      setSuccessMessage('Profile updated successfully.');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (err) {
      console.error('[Profile] Sign out failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 py-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </button>
          <span className="text-xs text-slate-400 font-medium">Account Settings</span>
        </div>

        {/* Profile Header Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs mb-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-extrabold text-2xl sm:text-3xl flex items-center justify-center shadow-lg shadow-indigo-500/25 border-4 border-white">
                {initials}
              </div>
              <span
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white"
                title="Active session"
              />
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {fullName || 'CloudMeet User'}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 flex items-center justify-center sm:justify-start gap-1.5 mt-0.5">
                    <Mail className="w-3.5 h-3.5" />
                    <span>{displayEmail}</span>
                  </p>
                </div>

                <div className="flex items-center justify-center sm:justify-end gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      isGoogle
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}
                  >
                    <Shield className="w-3 h-3" />
                    <span>{isGoogle ? 'Google SSO' : 'Email & Password'}</span>
                  </span>
                </div>
              </div>

              {/* Account Meta */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Joined {formatCreationDate(accountCreated)}</span>
                </span>
                <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Authenticated Session Active</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Settings Form Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs mb-8">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Profile Details
              </h2>
              <p className="text-xs text-slate-500">
                Update how your name appears to other meeting participants
              </p>
            </div>
          </div>

          {/* Feedback Alerts */}
          {successMessage && (
            <div
              className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center gap-2"
              role="alert"
            >
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div
              className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800 flex items-center gap-2"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-5">
            {/* Full Name Input */}
            <div>
              <label
                htmlFor="profile-fullname"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Full Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="profile-fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  maxLength={100}
                  placeholder="Your display name"
                  disabled={saving || loadingProfile}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-slate-50/50 border transition-all duration-150 focus:bg-white focus:outline-none focus:ring-2 ${
                    validationError
                      ? 'border-rose-300 focus:ring-rose-500/20'
                      : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20'
                  }`}
                  aria-invalid={!!validationError}
                  aria-describedby={validationError ? 'fullname-error' : undefined}
                />
              </div>
              {validationError && (
                <p id="fullname-error" className="mt-1 text-xs text-rose-600 font-medium">
                  {validationError}
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-slate-400">
                1 to 100 characters. Visible to all peers in CloudMeet video sessions.
              </p>
            </div>

            {/* Email Address (Read-only) */}
            <div>
              <label
                htmlFor="profile-email"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="profile-email"
                  type="email"
                  value={displayEmail}
                  readOnly
                  disabled
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-slate-100 text-slate-500 border border-slate-200 cursor-not-allowed select-all"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                Managed via Supabase Authentication identity provider.
              </p>
            </div>

            {/* Form Actions */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <Button
                type="submit"
                variant="primary"
                disabled={saving || loadingProfile}
                icon={Save}
                id="profile-save-btn"
                className="w-full sm:w-auto"
              >
                {saving ? 'Saving profile...' : 'Save Changes'}
              </Button>

              <button
                type="button"
                onClick={handleSignOut}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200/80 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                id="profile-logout-btn"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out of Account</span>
              </button>
            </div>
          </form>
        </div>

        {/* Embedded Meeting History */}
        <div className="rounded-3xl overflow-hidden border border-slate-200/80 bg-white shadow-xs">
          <RecentMeetings user={user} />
        </div>
      </div>
    </div>
  );
}
