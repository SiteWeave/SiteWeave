import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import Avatar from './Avatar';

/**
 * ContactSelector Component
 * Allows selecting recipients from existing contacts or entering manual emails
 */
function ContactSelector({ 
  selectedRecipients = [], 
  onChange, 
  projectId = null,
  showRecipientType = true 
}) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [filterType, setFilterType] = useState('all'); // all, team, client, external

  // Filter contacts based on search and type
  const contacts = state.contacts || [];
  const availableContacts = contacts.filter(contact => {
    const matchesSearch = !searchTerm || 
      contact.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || 
      (filterType === 'team' && contact.type === 'Team') ||
      (filterType === 'client' && contact.type === 'Client') ||
      (filterType === 'external' && !contact.type);
    
    const isProjectContact = !projectId || 
      (contact.project_contacts && contact.project_contacts.some(pc => pc.project_id === projectId));
    
    return matchesSearch && matchesType && isProjectContact && contact.email;
  });

  // Filter out already selected contacts
  const unselectedContacts = availableContacts.filter(contact => 
    !selectedRecipients.some(r => r.email === contact.email)
  );

  const handleAddContact = (contact) => {
    const newRecipient = {
      contact_id: contact.id,
      email: contact.email,
      name: contact.name,
      recipient_type: 'to',
      contact_type: contact.type
    };
    onChange([...selectedRecipients, newRecipient]);
    setSearchTerm('');
  };

  const handleAddManualEmail = () => {
    if (!manualEmail || !manualEmail.includes('@')) {
      return;
    }
    
    const newRecipient = {
      email: manualEmail.trim(),
      recipient_type: 'to',
      contact_type: 'external'
    };
    onChange([...selectedRecipients, newRecipient]);
    setManualEmail('');
    setShowManualInput(false);
  };

  const handleRemoveRecipient = (index) => {
    onChange(selectedRecipients.filter((_, i) => i !== index));
  };

  const handleRecipientTypeChange = (index, newType) => {
    const updated = [...selectedRecipients];
    updated[index].recipient_type = newType;
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {/* Search and Filter */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={t('contact_selector.search_contacts')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">{t('common.all')}</option>
            <option value="team">{t('contact_selector.team')}</option>
            <option value="client">{t('contact_selector.clients')}</option>
            <option value="external">{t('contact_selector.external')}</option>
          </select>
        </div>

        {!showManualInput ? (
          <button type="button"
            onClick={() => setShowManualInput(true)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Add email address manually
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="email"
              placeholder={t('contact_selector.enter_email')}
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddManualEmail()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
            <button type="button"
              onClick={handleAddManualEmail}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add
            </button>
            <button type="button"
              onClick={() => {
                setShowManualInput(false);
                setManualEmail('');
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Selected Recipients */}
      {selectedRecipients.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">{t('contact_selector.recipients')}</label>
          <div className="space-y-2">
            {selectedRecipients.map((recipient, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
              >
                <Avatar name={recipient.name || recipient.email} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {recipient.name || recipient.email}
                  </p>
                  {recipient.name && (
                    <p className="text-xs text-gray-500 truncate">{recipient.email}</p>
                  )}
                  {recipient.contact_type && (
                    <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded ${
                      recipient.contact_type === 'Client' 
                        ? 'bg-yellow-100 text-yellow-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {recipient.contact_type}
                    </span>
                  )}
                </div>
                {showRecipientType && (
                  <select
                    value={recipient.recipient_type}
                    onChange={(e) => handleRecipientTypeChange(index, e.target.value)}
                    className="text-sm border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="to">To</option>
                    <option value="cc">CC</option>
                    <option value="bcc">BCC</option>
                  </select>
                )}
                <button type="button"
                  onClick={() => handleRemoveRecipient(index)}
                  className="text-red-600 hover:text-red-700"
                  aria-label={t('contact_selector.remove_recipient')}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Contacts List */}
      {searchTerm && unselectedContacts.length > 0 && (
        <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
          {unselectedContacts.map((contact) => (
            <button type="button"
              key={contact.id}
              onClick={() => handleAddContact(contact)}
              className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left"
            >
              <Avatar name={contact.name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                <p className="text-xs text-gray-500 truncate">{contact.email}</p>
              </div>
              {contact.type && (
                <span className={`px-2 py-1 text-xs rounded ${
                  contact.type === 'Client' 
                    ? 'bg-yellow-100 text-yellow-800' 
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {contact.type}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {selectedRecipients.length === 0 && !searchTerm && (
        <p className="text-sm text-gray-500 text-center py-4">
          Search for contacts or add email addresses manually
        </p>
      )}
    </div>
  );
}

export default ContactSelector;
