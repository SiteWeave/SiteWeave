import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listCustomTradeNames } from '@siteweave/core-logic';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';
import ConfirmDialog from './ConfirmDialog';
import LoadingSpinner from './LoadingSpinner';

/**
 * Manage org custom trades (free-text values beyond the built-in TRADE_OPTIONS).
 * Deleting a trade clears it from every contact that currently uses it.
 */
function ManageCustomTradesModal({
  contacts = [],
  onClose,
  onDeleteTrade,
  isDeleting = false,
}) {
  const { t } = useTranslation();
  const [tradePendingDelete, setTradePendingDelete] = useState(null);

  const customTrades = useMemo(() => {
    const names = listCustomTradeNames(contacts);
    return names.map((name) => ({
      name,
      count: contacts.filter((c) => (c?.trade || '').trim() === name).length,
    }));
  }, [contacts]);

  const handleConfirmDelete = async () => {
    if (!tradePendingDelete || isDeleting) return;
    await onDeleteTrade?.(tradePendingDelete);
    setTradePendingDelete(null);
  };

  return (
    <>
      <ModalOverlay onClose={onClose}>
        <div className={`w-full max-w-md rounded-xl bg-white p-6 shadow-xl ring-1 ring-slate-200/80 ${MODAL_PANEL_MAX_H} overflow-y-auto`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {t('contacts.manage_custom_trades_title')}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                {t('contacts.manage_custom_trades_subtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label={t('common.close')}
            >
              ✕
            </button>
          </div>

          {customTrades.length === 0 ? (
            <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {t('contacts.manage_custom_trades_empty')}
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {customTrades.map((trade) => (
                <li
                  key={trade.name}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{trade.name}</p>
                    <p className="text-xs text-slate-500">
                      {t('contacts.manage_custom_trades_usage', { count: trade.count })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTradePendingDelete(trade.name)}
                    disabled={isDeleting}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    {t('common.delete')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              {t('common.done')}
            </button>
          </div>
        </div>
      </ModalOverlay>

      {tradePendingDelete && (
        <ConfirmDialog
          isOpen
          onClose={() => {
            if (!isDeleting) setTradePendingDelete(null);
          }}
          onConfirm={handleConfirmDelete}
          title={t('contacts.delete_custom_trade_title')}
          message={t('contacts.delete_custom_trade_message', {
            trade: tradePendingDelete,
            count: customTrades.find((row) => row.name === tradePendingDelete)?.count || 0,
          })}
          confirmText={isDeleting ? undefined : t('common.delete')}
        />
      )}

      {isDeleting && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-black/10">
          <div className="rounded-lg bg-white px-4 py-3 shadow-lg ring-1 ring-slate-200">
            <LoadingSpinner size="sm" text={t('contacts.deleting_custom_trade')} />
          </div>
        </div>
      )}
    </>
  );
}

export default ManageCustomTradesModal;
