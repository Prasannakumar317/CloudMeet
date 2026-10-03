import React from 'react';

export default function FeatureCard({
  icon: Icon,
  title,
  description,
  badgeText,
  gradient = 'from-indigo-500 to-violet-600',
  accentBg = 'bg-indigo-50 text-indigo-600',
}) {
  return (
    <div className="group relative rounded-2xl bg-white p-7 border border-slate-200/80 shadow-xs hover:shadow-xl hover:shadow-indigo-500/5 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between overflow-hidden">
      {/* Top subtle highlight accent on hover */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-indigo-500/0 to-transparent group-hover:via-indigo-500/60 transition-all duration-300" />

      <div>
        <div className="flex items-center justify-between mb-5">
          <div
            className={`w-12 h-12 rounded-xl ${accentBg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}
          >
            {Icon && <Icon className="w-6 h-6 stroke-[2]" />}
          </div>
          {badgeText && (
            <span className="text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
              {badgeText}
            </span>
          )}
        </div>

        <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors mb-2.5">
          {title}
        </h3>

        <p className="text-sm leading-relaxed text-slate-600">
          {description}
        </p>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center text-xs font-semibold text-slate-400 group-hover:text-indigo-600 transition-colors gap-1.5">
        <span>Learn more</span>
        <span className="group-hover:translate-x-1 transition-transform">→</span>
      </div>
    </div>
  );
}
