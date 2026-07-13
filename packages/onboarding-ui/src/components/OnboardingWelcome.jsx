import React from 'react';
import TourIcon from './TourIcon';

export default function OnboardingWelcome({
  user,
  onStartTour,
  onSkip,
  primaryColor = '#3B82F6',
  copy = {},
}) {
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there';

  const {
    title = `Welcome to SiteWeave, ${userName}!`,
    subtitle = 'Your office command center is ready. Take a quick tour of the features that set SiteWeave apart from the field app.',
    featureReports = 'Branded progress reports for clients & architects',
    featureSchedule = 'Phases, Gantt, and full schedule control',
    featureTeam = 'Roles and invites for your whole crew',
    startTour = 'Take the office tour',
    skipTour = 'Skip for now',
    helpText = 'Replay anytime from Help → Getting started (desktop) or Settings.',
  } = copy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/20 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl">
        <div className="text-center">
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: `${primaryColor}1a` }}
          >
            <TourIcon name="star" className="h-8 w-8" style={{ color: primaryColor }} />
          </div>

          <h1 className="mb-2 text-2xl font-bold text-gray-900 [text-wrap:balance]">{title}</h1>
          <p className="mb-6 text-gray-600 [text-wrap:pretty]">{subtitle}</p>

          <div className="mb-8 space-y-3 text-left">
            <div className="flex items-center gap-3">
              <TourIcon name="chart" className="h-5 w-5" style={{ color: primaryColor }} />
              <span className="text-sm text-gray-700">{featureReports}</span>
            </div>
            <div className="flex items-center gap-3">
              <TourIcon name="calendar" className="h-5 w-5" style={{ color: primaryColor }} />
              <span className="text-sm text-gray-700">{featureSchedule}</span>
            </div>
            <div className="flex items-center gap-3">
              <TourIcon name="users" className="h-5 w-5" style={{ color: primaryColor }} />
              <span className="text-sm text-gray-700">{featureTeam}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onStartTour}
              className="w-full rounded-lg px-6 py-3 font-semibold text-white transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.96]"
              style={{ backgroundColor: primaryColor }}
            >
              {startTour}
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="w-full rounded-lg px-6 py-3 font-medium text-gray-600 transition-[transform,background-color] duration-150 hover:bg-gray-100 active:scale-[0.96]"
            >
              {skipTour}
            </button>
          </div>

          <p className="mt-4 text-xs text-gray-500">{helpText}</p>
        </div>
      </div>
    </div>
  );
}
