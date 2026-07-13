import React, { useEffect, useState } from 'react';

export default function OnboardingSpotlight({
  targetSelector,
  isVisible = false,
  children,
  primaryColor = '#3B82F6',
  onOverlayClick,
}) {
  const [targetElement, setTargetElement] = useState(null);
  const [spotlightStyle, setSpotlightStyle] = useState({});

  useEffect(() => {
    if (!isVisible || !targetSelector) {
      setTargetElement(null);
      return undefined;
    }

    const element = document.querySelector(targetSelector);
    if (!element) {
      console.warn(`OnboardingSpotlight: Element not found for selector "${targetSelector}"`);
      setTargetElement(null);
      return undefined;
    }

    setTargetElement(element);

    const updateSpotlight = () => {
      const rect = element.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      setSpotlightStyle({
        position: 'absolute',
        top: rect.top + scrollY - 8,
        left: rect.left + scrollX - 8,
        width: rect.width + 16,
        height: rect.height + 16,
        borderRadius: '12px',
        border: `4px solid ${primaryColor}`,
        backgroundColor: `${primaryColor}1a`,
        boxShadow: `0 0 20px ${primaryColor}80`,
        zIndex: 50,
        pointerEvents: 'none',
        animation: 'siteweave-onboarding-pulse 2s infinite',
      });
    };

    updateSpotlight();

    const handleUpdate = () => updateSpotlight();
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isVisible, targetSelector, primaryColor]);

  if (!isVisible) return children;

  return (
    <>
      {targetElement ? <div style={spotlightStyle} /> : null}
      <div className="relative z-50">{children}</div>
      <style>{`
        @keyframes siteweave-onboarding-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.02); }
        }
      `}</style>
    </>
  );
}
