import React, { useEffect, useState } from 'react';
import { useWorkspaceTier } from '../hooks/useWorkspaceTier';

const SALES_URL = 'https://www.siteweave.org/#contact';

function TrialCountdownBanner({ className = '' }) {
    const { showTrialCountdown, trialDaysRemaining } = useWorkspaceTier();
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!showTrialCountdown) return undefined;
        const id = window.setInterval(() => setTick((t) => t + 1), 60 * 60 * 1000);
        return () => window.clearInterval(id);
    }, [showTrialCountdown]);

    if (!showTrialCountdown) return null;

    const urgent = trialDaysRemaining <= 3;
    const dayLabel = trialDaysRemaining === 1 ? '1 day left' : `${trialDaysRemaining} days left`;

    return (
        <div
            className={`rounded-lg border px-3 py-2 text-xs leading-snug ${
                urgent
                    ? 'border-amber-200 bg-amber-50 text-amber-950'
                    : 'border-blue-100 bg-blue-50 text-blue-950'
            } ${className}`}
            role="status"
        >
            <p className="font-semibold tabular-nums">
                Full access · {dayLabel}
            </p>
            <p className="mt-0.5 text-[11px] opacity-90">
                {urgent
                    ? 'Talk to us to keep pings, reports, and exports.'
                    : 'Progress reports, pings, and exports included during trial.'}
            </p>
            <a
                href={SALES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-1.5 inline-block font-semibold underline underline-offset-2 ${
                    urgent ? 'text-amber-900' : 'text-blue-800'
                }`}
            >
                Contact Us
            </a>
        </div>
    );
}

export default TrialCountdownBanner;
