import React from 'react';

function OnboardingProgress({ currentStep, totalSteps, currentView }) {
  const progressPercentage = (currentStep / totalSteps) * 100;
  
  const viewNames = {
    'Dashboard': 'Dashboard',
    'Projects': 'Projects', 
    'Calendar': 'Calendar',
    'Contacts': 'Team',
    'Messages': 'Team',
    'Team': 'Team',
    'Settings': 'Settings'
  };

  return (
    <div className="fixed top-4 right-4 z-50 bg-white rounded-lg shadow-lg p-4 min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">
          Step {currentStep + 1} of {totalSteps}
        </span>
        <span className="text-xs text-gray-500">
          {viewNames[currentView] || 'Tour'}
        </span>
      </div>
      
      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      
      {/* Progress Percentage */}
      <div className="text-xs text-gray-500 text-center">
        {Math.round(progressPercentage)}% Complete
      </div>
      
      {/* Mini Progress Dots */}
      <div className="flex justify-center mt-2 space-x-1">
        {Array.from({ length: Math.min(totalSteps, 10) }, (_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${
              i <= (currentStep / totalSteps) * 10 
                ? 'bg-blue-600' 
                : 'bg-gray-300'
            }`}
          />
        ))}
        {totalSteps > 10 && (
          <span className="text-xs text-gray-400 ml-1">...</span>
        )}
      </div>
    </div>
  );
}

export default OnboardingProgress;
