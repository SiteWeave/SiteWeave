import React from 'react';
import Icon from './Icon';

function OnboardingWelcome({ user, onStartTour, onSkip }) {
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there';

  return (
    <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center">
          {/* Welcome Icon */}
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
            <Icon 
              path="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" 
              className="w-8 h-8 text-blue-600"
            />
          </div>

          {/* Welcome Message */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to SiteWeave, {userName}!
          </h1>
          
          <p className="text-gray-600 mb-6">
            Your construction project management platform is ready to help you stay organized and connected with your team.
          </p>

          {/* Features Overview */}
          <div className="text-left mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <Icon path="M3.75 3v16.5h16.5M3.75 19.5v-1.5a1.5 1.5 0 011.5-1.5h1.5a1.5 1.5 0 011.5 1.5v1.5m-3 0h3m10.5-16.5h-3a1.5 1.5 0 00-1.5 1.5v3a1.5 1.5 0 001.5 1.5h3a1.5 1.5 0 001.5-1.5v-3a1.5 1.5 0 00-1.5-1.5zm-3 0h3m-3 10.5h3a1.5 1.5 0 001.5-1.5v-3a1.5 1.5 0 00-1.5-1.5h-3a1.5 1.5 0 00-1.5 1.5v3a1.5 1.5 0 001.5 1.5zm-3 0h3" className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-gray-700">Manage projects and track progress</span>
            </div>
            <div className="flex items-center gap-3">
              <Icon path="M6.75 3v2.25m10.5-2.25v2.25M3.75 11.25h16.5m-16.5 5.25h16.5m-16.5 5.25h16.5M5.625 3.75h12.75c1.035 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875H5.625c-1.035 0-1.875-.84-1.875-1.875V5.625c0-1.035.84-1.875 1.875-1.875z" className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-gray-700">Schedule events and deadlines</span>
            </div>
            <div className="flex items-center gap-3">
              <Icon path="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.5-2.964c.376-.086.764.042 1.06.292m-1.06-.292a2.25 2.25 0 01-4.24 0m4.24 0a9.094 9.094 0 00-3.742-.479 3 3 0 00-4.682 2.72m7.5-2.964V12a2.25 2.25 0 00-2.25-2.25m0 0a9.094 9.094 0 013.742-.479 3 3 0 014.682 2.72m-7.5 2.964v2.25c0 .621.504 1.125 1.125 1.125h3.375c.621 0 1.125-.504 1.125-1.125v-2.25" className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-gray-700">Connect with your team</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <button type="button"
              onClick={onStartTour}
              className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              Take a Quick Tour
            </button>
            
            <button type="button"
              onClick={onSkip}
              className="w-full px-6 py-3 text-gray-600 font-medium rounded-lg hover:bg-gray-100 transition-colors"
            >
              Skip Tour
            </button>
          </div>

          {/* Help Text */}
          <p className="text-xs text-gray-500 mt-4">
            You can always access help and tutorials from the settings menu.
          </p>
        </div>
      </div>
    </div>
  );
}

export default OnboardingWelcome;
