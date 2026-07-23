import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';
import { parseContactsCsv } from '../utils/contactsCsvParser.js';
import {
  CONTACT_TARGET,
  buildContactsFromMappedRows,
  getContactImportBlockingIssues,
  getContactImportWarnings,
  mergeWithSuggestedContactMappings,
} from '../utils/contactsImportMapping.js';
import { importContactsFromCsv } from '../utils/contactsImportService.js';
import { ensureOrganizationForWrites } from '../utils/organizationContext';
import { translateImportMessage } from '@siteweave/i18n';

/**
 * Trade-partner CSV import. Simple by default; column mapping under Advanced.
 * @param {{
 *   onClose: () => void,
 *   onSuccess?: (contacts: object[]) => void,
 * }} props
 */
export default function ContactsImportModal({ onClose, onSuccess }) {
  const { t } = useTranslation();
  const { state, dispatch } = useAppContext();
  const { addToast } = useToast();
  const fileInputRef = useRef(null);

  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [parseError, setParseError] = useState('');
  const [parsed, setParsed] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mappings, setMappings] = useState({});
  const [layoutOverride, setLayoutOverride] = useState('');
  const [busy, setBusy] = useState(false);

  const layout = parsed?.layout || 'flat';

  const reparseWithLayout = (text, forceLayout) => {
    const res = parseContactsCsv(text, {
      forceLayout: forceLayout || null,
    });
    if (res.error) {
      setParseError(translateImportMessage(res.error, t));
      setParsed(null);
      return;
    }
    setParseError('');
    setParsed(res);
  };

  const targetOptions = useMemo(() => [
    { value: '', label: t('contacts_import.target_not_mapped') },
    { value: CONTACT_TARGET.NAME, label: t('contacts_import.target_name') },
    { value: CONTACT_TARGET.COMPANY, label: t('contacts_import.target_company') },
    { value: CONTACT_TARGET.TRADE, label: t('contacts_import.target_trade') },
    { value: CONTACT_TARGET.ROLE, label: t('contacts_import.target_role') },
    { value: CONTACT_TARGET.EMAIL, label: t('contacts_import.target_email') },
    { value: CONTACT_TARGET.PHONE, label: t('contacts_import.target_phone') },
    { value: CONTACT_TARGET.IGNORE, label: t('contacts_import.target_ignore') },
  ], [t]);

  const mergedMappings = useMemo(
    () => mergeWithSuggestedContactMappings(mappings, layout),
    [mappings, layout],
  );

  const preview = useMemo(() => {
    if (!parsed?.rows?.length) return null;
    return buildContactsFromMappedRows({
      rows: parsed.rows,
      sourceFieldMappings: mergedMappings,
      layout,
    });
  }, [parsed, mergedMappings, layout]);

  const blockingIssues = useMemo(
    () => getContactImportBlockingIssues(mergedMappings, preview),
    [mergedMappings, preview],
  );

  const mappingWarnings = useMemo(
    () => getContactImportWarnings(mergedMappings),
    [mergedMappings],
  );

  const allWarnings = useMemo(
    () => [...mappingWarnings, ...(preview?.warnings || [])],
    [mappingWarnings, preview],
  );

  const discovered = parsed?.discoveredFields || [];
  const canImport = Boolean(preview && blockingIssues.length === 0 && preview.createCount > 0 && !busy);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setFileName(file.name);
    setMappings({});
    setLayoutOverride('');
    try {
      const text = await file.text();
      setCsvText(text);
      reparseWithLayout(text, '');
    } catch (err) {
      setParseError(err?.message || t('contacts_import.could_not_read_file'));
      setParsed(null);
    }
  };

  const handleImport = async () => {
    if (!state.user?.id) {
      addToast(t('contacts_import.missing_org_user'), 'error');
      return;
    }
    if (!csvText) {
      addToast(t('contacts_import.upload_csv_first'), 'error');
      return;
    }
    if (blockingIssues.length > 0) {
      addToast(translateImportMessage(blockingIssues[0], t), 'error');
      return;
    }

    setBusy(true);
    try {
      const orgContext = await ensureOrganizationForWrites(supabaseClient, {
        userId: state.user.id,
        accountIntent: state.accountIntent,
        currentOrganization: state.currentOrganization,
        dispatch,
      });
      if (!orgContext.ok) {
        addToast(orgContext.error || t('contacts_import.missing_org_user'), 'error');
        return;
      }

      const result = await importContactsFromCsv(supabaseClient, {
        csvText,
        organizationId: orgContext.organizationId,
        userId: state.user.id,
        sourceFieldMappings: mappings,
        layoutOverride: layoutOverride || null,
      });

      if (!result.success) {
        addToast(translateImportMessage(result.error, t) || t('contacts_import.import_failed'), 'error');
        return;
      }

      const { imported = 0, skippedDuplicates = 0, skippedIncomplete = 0 } = result.metrics || {};
      addToast(
        t('contacts_import.imported_metrics', {
          imported,
          duplicates: skippedDuplicates,
          incomplete: skippedIncomplete,
        }),
        'success',
      );

      if (result.warnings?.length) {
        result.warnings.slice(0, 3).forEach((w) => addToast(translateImportMessage(w, t), 'warning'));
      }

      if (result.contacts?.length) {
        onSuccess?.(result.contacts);
      }
      onClose();
    } catch (err) {
      addToast(err?.message || t('contacts_import.import_failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalOverlay onClose={busy ? undefined : onClose} align="start">
      <div className={`bg-white rounded-xl shadow-2xl w-full max-w-lg ${MODAL_PANEL_MAX_H} overflow-hidden flex flex-col`}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">{t('contacts_import.title')}</h2>
          <p className="text-sm text-gray-600 mt-1">{t('contacts_import.intro')}</p>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFile}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              {t('contacts_import.choose_file')}
            </button>
            {fileName ? (
              <p className="text-xs text-gray-500 mt-2">{fileName}</p>
            ) : null}
            {parseError ? (
              <p className="text-sm text-red-600 mt-2">{parseError}</p>
            ) : null}
          </div>

          {preview && (
            <div className={`rounded-xl border px-4 py-4 space-y-3 ${blockingIssues.length > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
              {blockingIssues.length === 0 ? (
                <>
                  <p className="text-sm font-semibold text-green-800">
                    {t('contacts_import.ready_to_import')}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white rounded-lg py-2 shadow-xs">
                      <div className="text-xl font-bold text-gray-900">{preview.createCount}</div>
                      <div className="text-xs text-gray-500">{t('contacts_import.create_label')}</div>
                    </div>
                    <div className="bg-white rounded-lg py-2 shadow-xs">
                      <div className="text-xl font-bold text-gray-900">{preview.skippedIncomplete}</div>
                      <div className="text-xs text-gray-500">{t('contacts_import.skip_label')}</div>
                    </div>
                    <div className="bg-white rounded-lg py-2 shadow-xs">
                      <div className="text-xl font-bold text-gray-900">{layout === 'sectioned' ? t('contacts_import.layout_sectioned_short') : t('contacts_import.layout_flat_short')}</div>
                      <div className="text-xs text-gray-500">{t('contacts_import.layout_label')}</div>
                    </div>
                  </div>
                  {preview.samples?.length > 0 && (
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">{t('contacts_import.samples_heading')} </span>
                      {preview.samples.join(' · ')}
                      {preview.createCount > preview.samples.length && (
                        <span className="text-gray-400">
                          {' '}
                          {t('contacts_import.more_count', { count: preview.createCount - preview.samples.length })}
                        </span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-red-700 mb-1">{t('contacts_import.cannot_import')}</p>
                  <ul className="space-y-1 text-sm text-red-700">
                    {blockingIssues.map((issue, idx) => (
                      <li key={idx}>• {translateImportMessage(issue, t)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {allWarnings.length > 0 && preview && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold text-amber-800 mb-1">{t('contacts_import.heads_up')}</p>
              <ul className="space-y-1 text-xs text-amber-700">
                {allWarnings.map((w, idx) => (
                  <li key={idx}>• {translateImportMessage(w, t)}</li>
                ))}
              </ul>
            </div>
          )}

          {parsed && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 text-left"
              >
                <span>{t('contacts_import.advanced_options')}</span>
                <span className="text-gray-400 text-xs">
                  {showAdvanced ? t('contacts_import.hide') : t('contacts_import.show')}
                </span>
              </button>

              {showAdvanced && (
                <div className="px-4 py-4 space-y-4 border-t border-gray-200">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      {t('contacts_import.layout_override')}
                    </label>
                    <select
                      value={layoutOverride}
                      onChange={(e) => {
                        const next = e.target.value;
                        setLayoutOverride(next);
                        if (csvText) reparseWithLayout(csvText, next);
                      }}
                      className="w-full p-2 border rounded-lg text-sm bg-white"
                    >
                      <option value="">{t('contacts_import.layout_auto', { detected: parsed.layout })}</option>
                      <option value="flat">{t('contacts_import.layout_flat')}</option>
                      <option value="sectioned">{t('contacts_import.layout_sectioned')}</option>
                    </select>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">{t('contacts_import.field_mapping')}</p>
                    <p className="text-xs text-gray-500 mb-2">{t('contacts_import.field_mapping_hint')}</p>
                    <div className="border border-gray-200 rounded-lg overflow-hidden max-h-52 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left p-2 font-semibold">{t('contacts_import.source_field')}</th>
                            <th className="text-left p-2 font-semibold">{t('contacts_import.maps_to')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {discovered.map((f) => (
                            <tr key={f.key} className="border-t border-gray-100">
                              <td className="p-2 align-top">
                                <div className="font-mono text-gray-800">{f.key}</div>
                                <div className="text-gray-400">{f.label}</div>
                                {Array.isArray(f.samples) && f.samples.length > 0 && (
                                  <div className="text-gray-400 mt-0.5">
                                    {t('contacts_import.eg_samples', { samples: f.samples.slice(0, 2).join(', ') })}
                                  </div>
                                )}
                              </td>
                              <td className="p-2">
                                <select
                                  value={mergedMappings[f.key] ?? ''}
                                  onChange={(e) => setMappings((prev) => ({ ...prev, [f.key]: e.target.value }))}
                                  className="w-full p-1 border rounded text-xs"
                                >
                                  {targetOptions.map((o) => (
                                    <option key={o.value || 'empty'} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            disabled={busy}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {busy
              ? t('contacts_import.importing')
              : preview
                ? t('contacts_import.import_count', { count: preview.createCount })
                : t('contacts.import')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
