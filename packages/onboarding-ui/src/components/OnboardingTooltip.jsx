import React, { useEffect, useState } from 'react';
import TourIcon from './TourIcon';

export default function OnboardingTooltip({
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
  action = null,
  primaryColor = '#3B82F6',
  labels = {},
}) {
  const {
    previous = 'Previous',
    next = 'Next',
    finish = 'Finish',
    finishTour = 'Finish Tour',
    skipTour = 'Skip Tour',
    tryIt = 'Try It',
    tryHint = 'Try clicking the highlighted element to continue',
  } = labels;

  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0, arrowPosition: 'left' });
  const [targetElement, setTargetElement] = useState(null);

  useEffect(() => {
    if (!isVisible || !targetSelector) return undefined;

    const element = document.querySelector(targetSelector);
    if (!element) return undefined;

    setTargetElement(element);

    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top;
    let left;
    let arrowPosition;

    switch (position) {
      case 'top':
        top = rect.top - 220;
        left = rect.left + rect.width / 2 - 160;
        arrowPosition = 'bottom';
        break;
      case 'bottom':
        top = rect.bottom + 20;
        left = rect.left + rect.width / 2 - 160;
        arrowPosition = 'top';
        break;
      case 'left':
        top = rect.top + rect.height / 2 - 100;
        left = rect.left - 340;
        arrowPosition = 'right';
        break;
      case 'center':
        top = viewportHeight / 2 - 100;
        left = viewportWidth / 2 - 160;
        arrowPosition = null;
        break;
      default:
        top = rect.top + rect.height / 2 - 100;
        left = rect.right + 20;
        arrowPosition = 'left';
    }

    if (left < 20) left = 20;
    if (left + 320 > viewportWidth - 20) left = viewportWidth - 340;
    if (top < 20) top = 20;
    if (top + 250 > viewportHeight - 20) top = viewportHeight - 270;

    setTooltipPosition({ top, left, arrowPosition });
  }, [isVisible, targetSelector, position]);

  if (!isVisible || !targetElement) return null;

  const progressPercent = (step / totalSteps) * 100;
  const nextLabel =
    action === 'complete' ? finishTour : action === 'prompt' ? tryIt : step === totalSteps ? finish : next;

  return (
    <div
      className="fixed rounded-xl border border-gray-200 bg-white p-6 shadow-2xl"
      style={{
        top: tooltipPosition.top,
        left: tooltipPosition.left,
        width: '320px',
        minHeight: '250px',
        maxHeight: '500px',
        overflow: 'visible',
        zIndex: 10000,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {tooltipPosition.arrowPosition ? (
        <div
          className={`absolute h-0 w-0 ${
            tooltipPosition.arrowPosition === 'left'
              ? '-left-2 top-1/2 -translate-y-1/2 border-b-8 border-l-8 border-t-8 border-b-transparent border-l-white border-t-transparent'
              : tooltipPosition.arrowPosition === 'right'
                ? '-right-2 top-1/2 -translate-y-1/2 border-b-8 border-r-8 border-t-8 border-b-transparent border-r-white border-t-transparent'
                : tooltipPosition.arrowPosition === 'top'
                  ? '-top-2 left-1/2 -translate-x-1/2 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white'
                  : '-bottom-2 left-1/2 -translate-x-1/2 border-b-8 border-l-8 border-r-8 border-b-white border-l-transparent border-r-transparent'
          }`}
        />
      ) : null}

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900 [text-wrap:balance]">{title}</h3>
          <span className="shrink-0 text-sm text-gray-500 tabular-nums">
            {step} of {totalSteps}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-gray-600 [text-wrap:pretty]">{description}</p>
      </div>

      <div className="mb-4">
        <div className="h-2 w-full rounded-full bg-gray-200">
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%`, backgroundColor: primaryColor }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-2">
          {step > 1 ? (
            <button
              type="button"
              onClick={onPrevious}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-600 transition-[transform,background-color,color] duration-150 hover:bg-gray-100 hover:text-gray-800 active:scale-[0.96]"
            >
              <TourIcon name="chevronLeft" className="h-4 w-4" />
              {previous}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onNext}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-150 active:scale-[0.96] ${
              action === 'prompt'
                ? 'bg-orange-600 hover:bg-orange-700'
                : action === 'complete'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : ''
            }`}
            style={
              action === 'prompt' || action === 'complete'
                ? undefined
                : { backgroundColor: primaryColor }
            }
          >
            {nextLabel}
          </button>
        </div>

        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg px-3 py-2 text-sm text-gray-500 transition-[transform,background-color,color] duration-150 hover:bg-gray-100 hover:text-gray-700 active:scale-[0.96]"
        >
          {skipTour}
        </button>
      </div>

      {action === 'prompt' ? (
        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-2">
          <p className="text-xs text-orange-700">{tryHint}</p>
        </div>
      ) : null}
    </div>
  );
}
