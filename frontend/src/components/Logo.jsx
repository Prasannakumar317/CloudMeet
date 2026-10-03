import React from 'react';
import { Link } from 'react-router-dom';
import { Video } from 'lucide-react';

export default function Logo({ size = 'md', isDark = false, asLink = true }) {
  const iconSizes = {
    sm: 'w-7 h-7 p-1.5',
    md: 'w-9 h-9 p-2',
    lg: 'w-11 h-11 p-2.5',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  const content = (
    <div className="flex items-center gap-2.5 group select-none">
      <div
        className={`${iconSizes[size]} rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:shadow-indigo-500/35 transition-all duration-300 group-hover:scale-105`}
      >
        <Video className="w-full h-full stroke-[2.2]" />
      </div>
      <div className="flex items-center font-bold tracking-tight">
        <span
          className={`${textSizes[size]} ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}
        >
          Cloud
        </span>
        <span
          className={`${textSizes[size]} bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent`}
        >
          Meet
        </span>
      </div>
    </div>
  );

  if (asLink) {
    return (
      <Link
        to="/"
        className="inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
        aria-label="CloudMeet Homepage"
      >
        {content}
      </Link>
    );
  }

  return content;
}
