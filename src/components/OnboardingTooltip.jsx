import React, { useEffect, useState } from 'react';
import Icon from './Icon';

function OnboardingTooltip({ 
  targetSelector, 
  title, 
  description, 
  step, 
  totalSteps, 
  onNext, 
  onPrevious, 
  onSkip,
  isVisible = false,
  position = 'right',
  action = null
}) {
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0, arrowPosition: 'left' });
  const [targetElement, setTargetElement] = useState(null);

  useEffect(() => {
    if (!isVisible || !targetSelector) return;

    const element = document.querySelector(targetSelector);
    if (!element) return;

    setTargetElement(element);
    
    // Calculate position based on preference
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let top, left, arrowPosition;
    
    switch (position) {
      case 'top':
        top = rect.top - 220; // Tooltip height + margin
        left = rect.left + (rect.width / 2) - 160; // Center horizontally
        arrowPosition = 'bottom';
        break;
      case 'bottom':
        top = rect.bottom + 20;
        left = rect.left + (rect.width / 2) - 160;
        arrowPosition = 'top';
        break;
      case 'left':
        top = rect.top + (rect.height / 2) - 100;
        left = rect.left - 340;
        arrowPosition = 'right';
        break;
      case 'center':
        top = viewportHeight / 2 - 100;
        left = viewportWidth / 2 - 160;
        arrowPosition = null;
        break;
      default: // right
        top = rect.top + (rect.height / 2) - 100;
        left = rect.right + 20;
        arrowPosition = 'left';
    }

    // Adjust if tooltip would go off screen
    if (left < 20) left = 20;
    if (left + 320 > viewportWidth - 20) left = viewportWidth - 340;
    if (top < 20) top = 20;
    if (top + 250 > viewportHeight - 20) top = viewportHeight - 270; // Increased height for buttons

    setTooltipPosition({ top, left, arrowPosition });
  }, [isVisible, targetSelector, position]);

  if (!isVisible || !targetElement) return null;

    return (
    <div 
      className="fixed bg-white rounded-xl shadow-2xl p-6 border border-gray-200"
      style={{
        top: tooltipPosition.top,
        left: tooltipPosition.left,
        width: '320px',
        minHeight: '250px',
        maxHeight: '500px',
        overflow: 'visible',
        zIndex: 10000 // Much higher than spotlight
      }}
    >
      {/* Arrow */}
      {tooltipPosition.arrowPosition && (
        <div 
          className={`absolute w-0 h-0 ${
            tooltipPosition.arrowPosition === 'left' 
              ? 'border-t-8 border-b-8 border-l-8 border-t-transparent border-b-transparent border-l-white -left-2 top-1/2 transform -translate-y-1/2'
              : tooltipPosition.arrowPosition === 'right'
              ? 'border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-white -right-2 top-1/2 transform -translate-y-1/2'
              : tooltipPosition.arrowPosition === 'top'
              ? 'border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white -top-2 left-1/2 transform -translate-x-1/2'
              : 'border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-white -bottom-2 left-1/2 transform -translate-x-1/2'
          }`}
        />
      )}

      {/* Content */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <span className="text-sm text-gray-500">{step} of {totalSteps}</span>
        </div>
        <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex gap-2">
          {step > 1 && (
            <button type="button"
              onClick={onPrevious}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
            >
              <Icon path="M15.75 19.5L8.25 12l7.5-7.5" className="w-4 h-4" />
              Previous
            </button>
          )}
          
          <button type="button"
            onClick={onNext}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center gap-2 ${
              action === 'prompt' 
                ? 'bg-orange-600 hover:bg-orange-700' 
                : action === 'complete'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {action === 'prompt' && (
              <Icon path="M15.75 19.5L8.25 12l7.5-7.5" className="w-4 h-4" />
            )}
            {action === 'complete' ? 'Finish Tour' : action === 'prompt' ? 'Try It' : (step === totalSteps ? 'Finish' : 'Next')}
          </button>
        </div>

        <button type="button"
          onClick={onSkip}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Skip Tour
        </button>
      </div>

      {/* Action hint for interactive steps */}
      {action === 'prompt' && (
        <div className="mt-3 p-2 bg-orange-50 border border-orange-200 rounded-lg">
          <p className="text-xs text-orange-700">
            💡 Try clicking the highlighted element to continue
          </p>
        </div>
      )}
    </div>
  );
}

export default OnboardingTooltip;
