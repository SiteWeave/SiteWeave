import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import Avatar from './Avatar';

const builderKey = (suffix) => `progressReports.builder.${suffix}`;

/** @returns {Array<{ email: string, recipient_type: string }>} */
export function parseProgressReportEmailsText(text) {
  const raw = String(text || '')
    .split(/[\n,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set();
  return raw
    .filter((email) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    })
    .map((email) => ({ email, recipient_type: 'to' }));
}

/**
 * Progress report recipients: email input (default) or contact picker.
 */
export default forwardRef(function ProgressReportRecipientsField({
  recipients = [],
  onChange,
  projectId = null,
}, ref) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const [inputMode, setInputMode] = useState('email');
  const [emailDraft, setEmailDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const isEmailFocusedRef = useRef(false);

  const contacts = state.contacts || [];

  const contactLinked = useMemo(
    () => recipients.filter((r) => r.contact_id),
    [recipients],
  );

  const manualEmailText = useMemo(
    () =>
      recipients
        .filter((r) => !r.contact_id)
        .map((r) => r.email)
        .filter(Boolean)
        .join(', '),
    [recipients],
  );

  const commitEmailDraft = useCallback(() => {
    const parsed = parseProgressReportEmailsText(emailDraft);
    const contactEmails = new Set(contactLinked.map((r) => r.email?.toLowerCase()));
    const manualOnly = parsed.filter((r) => !contactEmails.has(r.email));
    const next = [...contactLinked, ...manualOnly];
    onChange(next);
    setEmailDraft(manualOnly.map((r) => r.email).join(', '));
    return next;
  }, [contactLinked, emailDraft, onChange]);

  useImperativeHandle(ref, () => ({ flush: commitEmailDraft }), [commitEmailDraft]);

  useEffect(() => {
    if (isEmailFocusedRef.current) return;
    setEmailDraft(manualEmailText);
  }, [manualEmailText]);

  const selectedEmailSet = useMemo(() => {
    const set = new Set(recipients.map((r) => r.email?.toLowerCase()).filter(Boolean));
    return set;
  }, [recipients]);

  const availableContacts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return contacts
      .filter((contact) => {
        if (!contact.email) return false;
        const matchesSearch =
          !term ||
          contact.name?.toLowerCase().includes(term) ||
          contact.email?.toLowerCase().includes(term);
        const matchesType =
          filterType === 'all' ||
          (filterType === 'team' && contact.type === 'Team') ||
          (filterType === 'client' && contact.type === 'Client') ||
          (filterType === 'external' && !contact.type);
        const isProjectContact =
          !projectId ||
          (contact.project_contacts &&
            contact.project_contacts.some((pc) => pc.project_id === projectId));
        return matchesSearch && matchesType && isProjectContact;
      })
      .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
  }, [contacts, filterType, projectId, searchTerm]);

  const toggleContact = (contact) => {
    const isSelected = recipients.some((r) => r.contact_id === contact.id);
    if (isSelected) {
      onChange(recipients.filter((r) => r.contact_id !== contact.id));
      return;
    }
    onChange([
      ...recipients,
      {
        contact_id: contact.id,
        email: contact.email,
        name: contact.name,
        recipient_type: 'to',
        contact_type: contact.type,
      },
    ]);
  };

  const removeRecipient = (recipient) => {
    if (recipient.contact_id) {
      onChange(recipients.filter((r) => r.contact_id !== recipient.contact_id));
      return;
    }
    onChange(recipients.filter((r) => r.email?.toLowerCase() !== recipient.email?.toLowerCase()));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-sm font-medium text-gray-700">{t(builderKey('recipients'))}</label>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setInputMode('email')}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              inputMode === 'email'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t(builderKey('recipients_mode_email'))}
          </button>
          <button
            type="button"
            onClick={() => {
              commitEmailDraft();
              setInputMode('contacts');
            }}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              inputMode === 'contacts'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t(builderKey('recipients_mode_contacts'))}
          </button>
        </div>
      </div>

      {recipients.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {recipients.map((recipient) => (
            <span
              key={recipient.contact_id || recipient.email}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-1 pr-2 text-sm text-gray-800"
            >
              <Avatar name={recipient.name || recipient.email} size="sm" />
              <span className="truncate">
                {recipient.name ? (
                  <>
                    <span className="font-medium">{recipient.name}</span>
                    <span className="text-gray-500"> · {recipient.email}</span>
                  </>
                ) : (
                  recipient.email
                )}
              </span>
              <button
                type="button"
                onClick={() => removeRecipient(recipient)}
                className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                aria-label={t('contact_selector.remove_recipient')}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {inputMode === 'email' ? (
        <div>
          <textarea
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            onFocus={() => {
              isEmailFocusedRef.current = true;
            }}
            onBlur={() => {
              isEmailFocusedRef.current = false;
              commitEmailDraft();
            }}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            placeholder={t(builderKey('recipients_placeholder'))}
          />
          <p className="mt-1 text-xs text-gray-500">{t(builderKey('recipients_hint'))}</p>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder={t('contact_selector.search_contacts')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">{t('common.all')}</option>
              <option value="team">{t('contact_selector.team')}</option>
              <option value="client">{t('contact_selector.clients')}</option>
              <option value="external">{t('contact_selector.external')}</option>
            </select>
          </div>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white">
            {availableContacts.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-gray-500">
                {t(builderKey('recipients_no_contacts'))}
              </p>
            ) : (
              availableContacts.map((contact) => {
                const selected = selectedEmailSet.has(contact.email?.toLowerCase());
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => toggleContact(contact)}
                    className={`flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-gray-50 ${
                      selected ? 'bg-blue-50/60' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      readOnly
                      checked={selected}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      tabIndex={-1}
                    />
                    <Avatar name={contact.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{contact.name}</p>
                      <p className="truncate text-xs text-gray-500">{contact.email}</p>
                    </div>
                    {contact.type && (
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                          contact.type === 'Client'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {contact.type}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          {projectId && (
            <p className="text-xs text-gray-500">{t(builderKey('recipients_contacts_project_scope'))}</p>
          )}
        </div>
      )}
    </div>
  );
});
