import React, { useState, useEffect } from 'react';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import LoadingSpinner from './LoadingSpinner';
import {
  getOrganizationBranding,
  updateOrganizationBranding,
  uploadLogo
} from '@siteweave/core-logic';
import { logActivity } from '../utils/activityLogger';

/** Defined at module scope so React does not remount children every parent render (fixes textarea focus loss). */
function BrandingSection({ compact, children }) {
  if (compact) {
    return <div className="border-t border-gray-100 pt-4">{children}</div>;
  }
  return <div className="bg-white rounded-lg border border-gray-200 p-6">{children}</div>;
}

/**
 * Branding Settings Component
 * Configure organization branding for email reports.
 * Pass compact=true to embed inside another card (removes nested borders and own title).
 */
function BrandingSettings({ compact = false }) {
  const { state } = useAppContext();
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [branding, setBranding] = useState({
    logo_url: null,
    primary_color: '#3B82F6',
    secondary_color: '#10B981',
    company_footer: '',
    email_signature: ''
  });

  useEffect(() => {
    if (state.currentOrganization?.id) {
      loadBranding();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentOrganization?.id]);

  const loadBranding = async () => {
    setIsLoading(true);
    try {
      const orgId = state.currentOrganization?.id;
      if (!orgId) return;

      const brandingData = await getOrganizationBranding(supabaseClient, orgId);
      setBranding(brandingData);
    } catch (error) {
      addToast('Error loading branding: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addToast('Please select an image file', 'error');
      return;
    }

    setIsUploadingLogo(true);
    try {
      const orgId = state.currentOrganization?.id;
      const logoUrl = await uploadLogo(supabaseClient, orgId, file);
      setBranding({ ...branding, logo_url: logoUrl });
      addToast('Logo uploaded successfully', 'success');
    } catch (error) {
      addToast('Error uploading logo: ' + error.message, 'error');
    } finally {
      setIsUploadingLogo(false);
      event.target.value = '';
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const orgId = state.currentOrganization?.id;
      await updateOrganizationBranding(supabaseClient, orgId, branding);
      if (state.user?.id && orgId) {
        logActivity({
          action: 'updated',
          entityType: 'branding',
          entityId: orgId,
          entityName: state.currentOrganization?.name || 'Organization',
          projectId: null,
          organizationId: orgId,
          user: state.user,
          details: { keys: ['logo_url', 'primary_color', 'secondary_color', 'company_footer', 'email_signature'].filter((k) => branding[k] != null) }
        });
      }
      addToast('Branding settings saved', 'success');
    } catch (error) {
      addToast('Error saving branding: ' + error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner text="Loading branding settings..." />;
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Email Branding</h2>
          <p className="text-sm text-gray-600 mt-1">
            Customize how your progress reports appear to recipients
          </p>
        </div>
      )}

      {/* Logo */}
      <BrandingSection compact={compact}>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Organization Logo
        </label>
        <div className="flex items-center gap-4">
          {branding.logo_url && (
            <img
              key={branding.logo_url}
              src={branding.logo_url}
              alt="Organization logo"
              className="h-14 w-auto rounded"
            />
          )}
          <div>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={isUploadingLogo}
                className="hidden"
              />
              <span className="inline-block px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {isUploadingLogo ? 'Uploading…' : branding.logo_url ? 'Change' : 'Upload Logo'}
              </span>
            </label>
            {branding.logo_url && (
              <button type="button"
                onClick={() => setBranding({ ...branding, logo_url: null })}
                className="ml-2 text-sm text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Appears at the top of email reports. Recommended: 200 × 60 px.
        </p>
      </BrandingSection>

      {/* Colors */}
      <BrandingSection compact={compact}>
        <p className="text-sm font-medium text-gray-700 mb-3">Brand Colors</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Primary — headers &amp; accents</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.primary_color}
                onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                className="h-8 w-14 border border-gray-300 rounded cursor-pointer p-0.5"
              />
              <input
                type="text"
                value={branding.primary_color}
                onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="#3B82F6"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Secondary — highlights &amp; checkmarks</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.secondary_color}
                onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                className="h-8 w-14 border border-gray-300 rounded cursor-pointer p-0.5"
              />
              <input
                type="text"
                value={branding.secondary_color}
                onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="#10B981"
              />
            </div>
          </div>
        </div>
      </BrandingSection>

      {/* Footer + Signature */}
      <BrandingSection compact={compact}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Footer</label>
            <textarea
              value={branding.company_footer ?? ''}
              onChange={(e) => setBranding({ ...branding, company_footer: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Company address, license number, contact info… (HTML supported)"
            />
            <p className="text-xs text-gray-400 mt-1">Appears at the bottom of every email report</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Signature</label>
            <textarea
              value={branding.email_signature ?? ''}
              onChange={(e) => setBranding({ ...branding, email_signature: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your name, title, phone…"
            />
          </div>
        </div>
      </BrandingSection>

      {/* Color preview swatch */}
      <BrandingSection compact={compact}>
        <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
        <div className="rounded-lg overflow-hidden border border-gray-200">
          <div style={{ backgroundColor: branding.primary_color, padding: '12px 16px' }}>
            {branding.logo_url
              ? <img key={branding.logo_url} src={branding.logo_url} alt="Logo preview" style={{ maxHeight: '40px' }} />
              : <span style={{ color: '#fff', fontSize: '13px', opacity: 0.8 }}>Your logo here</span>}
          </div>
          <div style={{ padding: '16px', backgroundColor: '#fff' }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '14px', color: '#111827' }}>
              Progress Update <span style={{ color: '#9ca3af' }}>—</span>{' '}
              <span style={{ color: branding.primary_color }}>Sample Project</span>
            </p>
            <p style={{ margin: '6px 0 0', color: branding.secondary_color, fontSize: '13px' }}>
              ✓ 5 tasks completed this period
            </p>
            {branding.company_footer && (
              <p style={{ margin: '12px 0 0', paddingTop: '10px', borderTop: '1px solid #e5e7eb', fontSize: '11px', color: '#9ca3af' }}>
                {branding.company_footer}
              </p>
            )}
          </div>
        </div>
      </BrandingSection>

      <div className="flex justify-end pt-1">
        <button type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save branding'}
        </button>
      </div>
    </div>
  );
}

export default BrandingSettings;
