import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const HINT_KEY = 'siteweave.phasesHint.dismissed';

function PhasesHintBanner() {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        try {
            setVisible(window.localStorage.getItem(HINT_KEY) !== '1');
        } catch {
            setVisible(true);
        }
    }, []);

    const dismiss = () => {
        try {
            window.localStorage.setItem(HINT_KEY, '1');
        } catch {
            /* ignore */
        }
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <span>{t('projectDetail.phases_hint')}</span>
            <button
                type="button"
                onClick={dismiss}
                className="font-medium text-blue-700 hover:text-blue-900 shrink-0 min-h-10 px-2"
            >
                {t('projectDetail.phases_hint_dismiss')}
            </button>
        </div>
    );
}

export default PhasesHintBanner;
