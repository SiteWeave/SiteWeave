import React from 'react';

const VIEW_LABELS = {
  Dashboard: 'Dashboard',
  Projects: 'Projects',
  Organization: 'Team',
  Settings: 'Settings',
};

export default function OnboardingProgress({ currentStep, totalSteps, currentView, primaryColor = '#3B82F6' }) {
  const progressPercentage = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="fixed right-4 top-4 z-[10001] min-w-[200px] rounded-lg bg-white p-4 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 tabular-nums">
          Step {currentStep + 1} of {totalSteps}
        </span>
        <span className="text-xs text-gray-500">{VIEW_LABELS[currentView] || 'Tour'}</span>
      </div>

      <div className="mb-2 h-2 w-full rounded-full bg-gray-200">
        <div
          className="h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercentage}%`, backgroundColor: primaryColor }}
        />
      </div>

      <div className="text-center text-xs text-gray-500 tabular-nums">{Math.round(progressPercentage)}% complete</div>
    </div>
  );
}
