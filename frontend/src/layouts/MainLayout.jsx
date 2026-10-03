import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Logo from '../components/Logo';
import { ShieldCheck, Heart } from 'lucide-react';

export default function MainLayout() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 bg-mesh-radial">
      {/* Top Navigation */}
      <Navbar />

      {/* Main Content Area */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Professional Footer */}
      <footer className="border-t border-slate-200/80 bg-white/70 backdrop-blur-md pt-14 pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-slate-100">
            {/* Brand Column */}
            <div className="space-y-4 md:col-span-1">
              <Logo size="md" />
              <p className="text-sm text-slate-600 leading-relaxed">
                Next-generation cloud video conferencing platform engineered for seamless, crystal-clear real-time communication.
              </p>
              <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium bg-emerald-50 w-fit px-2.5 py-1 rounded-full border border-emerald-200/60">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>All systems operational</span>
              </div>
            </div>

            {/* Product Links */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">
                Product
              </h4>
              <ul className="space-y-2.5 text-sm text-slate-600">
                <li>
                  <a href="/#features" className="hover:text-indigo-600 transition-colors">
                    HD Video & Audio
                  </a>
                </li>
                <li>
                  <a href="/#features" className="hover:text-indigo-600 transition-colors">
                    Screen Sharing
                  </a>
                </li>
                <li>
                  <a href="/#features" className="hover:text-indigo-600 transition-colors">
                    Team Chat
                  </a>
                </li>
                <li>
                  <a href="/#features" className="hover:text-indigo-600 transition-colors">
                    Security Architecture
                  </a>
                </li>
              </ul>
            </div>

            {/* Solutions Links */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">
                Platform
              </h4>
              <ul className="space-y-2.5 text-sm text-slate-600">
                <li>
                  <Link to="/meeting/demo-room" className="hover:text-indigo-600 transition-colors">
                    Live Demo Room
                  </Link>
                </li>
                <li>
                  <Link to="/login" className="hover:text-indigo-600 transition-colors">
                    Account Login
                  </Link>
                </li>
                <li>
                  <Link to="/signup" className="hover:text-indigo-600 transition-colors">
                    Create Account
                  </Link>
                </li>
                <li>
                  <a href="/#how-it-works" className="hover:text-indigo-600 transition-colors">
                    How it Works
                  </a>
                </li>
              </ul>
            </div>

            {/* Security & Standards */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">
                Trust & Security
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                Enterprise-grade room encryption, zero uninvited guests, and ultra-low latency media routing.
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span>End-to-End Secure Architecture</span>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>
              © {currentYear} CloudMeet Inc. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <span className="hover:text-slate-800 transition-colors cursor-pointer">
                Privacy Policy
              </span>
              <span className="hover:text-slate-800 transition-colors cursor-pointer">
                Terms of Service
              </span>
              <span className="hover:text-slate-800 transition-colors cursor-pointer">
                Cookie Settings
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
