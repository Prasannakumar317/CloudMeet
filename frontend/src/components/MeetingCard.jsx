import React from 'react';
import Button from './Button';

export default function MeetingCard({
  icon: Icon,
  title,
  description,
  buttonText = 'Start',
  buttonVariant = 'primary',
  onClick,
  onButtonClick,
  badge,
  children,
  className = '',
}) {
  return (
    <div
      onClick={onClick}
      className={`relative rounded-2xl bg-white p-6 border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-slate-300 transition-all duration-200 flex flex-col justify-between ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          {Icon && (
            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Icon className="w-5 h-5 stroke-[2]" />
            </div>
          )}
          {badge && (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200/50">
              {badge}
            </span>
          )}
        </div>

        <h3 className="text-base font-bold text-slate-900 mb-1.5">{title}</h3>
        {description && (
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            {description}
          </p>
        )}

        {children}
      </div>

      {buttonText && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <Button
            variant={buttonVariant}
            size="sm"
            fullWidth
            onClick={(e) => {
              if (onButtonClick) {
                e.stopPropagation();
                onButtonClick();
              }
            }}
          >
            {buttonText}
          </Button>
        </div>
      )}
    </div>
  );
}
