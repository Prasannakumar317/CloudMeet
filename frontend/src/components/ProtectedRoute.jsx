import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Video } from 'lucide-react';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Polished loading screen while Supabase session is being checked
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 select-none">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-xl shadow-indigo-500/25 animate-pulse">
            <Video className="w-7 h-7 stroke-[2.2]" />
          </div>
          <div className="text-center">
            <h2 className="text-sm font-semibold text-slate-200 tracking-wide">
              Connecting to CloudMeet...
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Verifying your secure session
            </p>
          </div>
          <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full animate-indeterminate" />
          </div>
        </div>
      </div>
    );
  }

  // If user is not authenticated, redirect to /login and preserve destination
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
