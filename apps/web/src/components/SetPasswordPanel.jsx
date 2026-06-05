import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { userHasEmailPassword } from '../utils/authIdentity';
import { FieldError, fieldInputClassName } from './FormAlert';

/**
 * Lets OAuth-only users add an email/password so they can sign in after signing out.
 */
function SetPasswordPanel({ user }) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState(null);
  const [errorField, setErrorField] = useState('confirm');

  if (!user || userHasEmailPassword(user) || done) {
    return null;
  }

  const setFieldError = (message, field = 'confirm') => {
    setFormError(message);
    setErrorField(field);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (password.length < 6) {
      setFieldError(t('toast.password_min_length'), 'password');
      return;
    }
    if (password !== confirm) {
      setFieldError(t('toast.new_passwords_do_not_match'), 'confirm');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabaseClient.auth.updateUser({ password });
      if (error) throw error;
      addToast(t('guest.password_set_success'), 'success');
      setDone(true);
    } catch (err) {
      setFieldError(t('guest.password_set_failed_short') || t('guest.password_set_failed'), 'confirm');
    } finally {
      setSaving(false);
    }
  };

  const inputBase =
    'w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2';

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-left">
      <p className="text-sm font-semibold text-amber-950">{t('guest.set_password_title')}</p>
      <p className="mt-1 text-xs text-amber-900 leading-relaxed">{t('guest.set_password_hint')}</p>
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFormError(null);
            }}
            placeholder={t('auth.password')}
            minLength={6}
            autoComplete="new-password"
            aria-invalid={errorField === 'password' && !!formError}
            className={fieldInputClassName(
              errorField === 'password' && !!formError,
              inputBase,
            )}
            required
          />
          {errorField === 'password' && <FieldError message={formError} />}
        </div>
        <div>
          <input
            type="password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setFormError(null);
            }}
            placeholder={t('guest.confirm_password')}
            minLength={6}
            autoComplete="new-password"
            aria-invalid={errorField === 'confirm' && !!formError}
            className={fieldInputClassName(
              errorField === 'confirm' && !!formError,
              inputBase,
            )}
            required
          />
          {errorField === 'confirm' && <FieldError message={formError} />}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full py-2 rounded-lg text-sm font-semibold bg-amber-900 text-white hover:bg-amber-950 disabled:opacity-50"
        >
          {saving ? t('common.saving') : t('guest.set_password_btn')}
        </button>
      </form>
    </div>
  );
}

export default SetPasswordPanel;
