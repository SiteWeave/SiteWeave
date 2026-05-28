import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';

function LiveActivityIndicator() {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isConnected, setIsConnected] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const previousOnlineState = useRef(navigator.onLine);
    const previousConnectedState = useRef(false);

    const checkConnectionStatus = async () => {
        setIsChecking(true);

        const networkOnline = navigator.onLine;
        const wasOnline = previousOnlineState.current;
        previousOnlineState.current = networkOnline;
        setIsOnline(networkOnline);

        if (!networkOnline) {
            const wasConnected = previousConnectedState.current;
            previousConnectedState.current = false;
            setIsConnected(false);
            setIsChecking(false);

            if (wasOnline) {
                addToast(t('connection.network_lost'), 'error', 10000);
            }
            return;
        }

        try {
            const { error } = await supabaseClient
                .from('projects')
                .select('id')
                .limit(1);

            const nowConnected = !error;
            const wasConnected = previousConnectedState.current;
            previousConnectedState.current = nowConnected;
            setIsConnected(nowConnected);

            if (wasConnected && !nowConnected) {
                addToast(t('connection.database_lost'), 'error', 10000);
            }

            if (!wasConnected && nowConnected) {
                addToast(t('connection.database_restored'), 'success');
            }
        } catch (err) {
            console.error('Connection check failed:', err);
            const wasConnected = previousConnectedState.current;
            previousConnectedState.current = false;
            setIsConnected(false);

            if (wasConnected) {
                addToast(t('connection.database_lost'), 'error', 10000);
            }
        } finally {
            setIsChecking(false);
        }
    };

    useEffect(() => {
        checkConnectionStatus();

        const interval = setInterval(checkConnectionStatus, 10000);

        const handleOnline = () => {
            const wasOffline = !previousOnlineState.current;
            previousOnlineState.current = true;
            setIsOnline(true);
            if (wasOffline) {
                addToast(t('connection.network_restored_checking'), 'info');
            }
            checkConnectionStatus();
        };

        const handleOffline = () => {
            const wasOnline = previousOnlineState.current;
            previousOnlineState.current = false;
            setIsOnline(false);
            setIsConnected(false);
            if (wasOnline) {
                addToast(t('connection.network_lost'), 'error', 10000);
            }
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            clearInterval(interval);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const isActive = isOnline && isConnected;
    const statusText = isChecking
        ? t('connection.checking')
        : (isActive ? t('connection.live') : t('connection.offline'));

    const statusTitle = isActive
        ? t('connection.connected_title')
        : isOnline
            ? t('connection.network_only_title')
            : t('connection.offline_title');

    return (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
            <div
                className={`w-2 h-2 rounded-full transition-colors ${
                    isActive
                        ? 'bg-green-500 animate-pulse'
                        : isOnline
                            ? 'bg-yellow-500'
                            : 'bg-gray-400'
                }`}
                title={statusTitle}
            />
            <span>{statusText}</span>
        </div>
    );
}

export default LiveActivityIndicator;
