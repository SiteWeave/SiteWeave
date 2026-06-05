import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import LoadingSpinner from './LoadingSpinner';
import Icon from './Icon';

/**
 * ForcePasswordReset Component
 * Shows when a user must change their temporary password
 * Cannot be bypassed - user must set a new password to continue
 */
function ForcePasswordReset({ show, onComplete }) {
  const { state } = useAppContext();
  const { addToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Pre-fill current password hint (for managed accounts, they know the temp PIN)
  useEffect(() => {
    // Don't auto-fill, but we can show a hint if needed
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      addToast('Please fill in all fields', 'error');
      return;
    }

    if (newPassword.length < 6) {
      addToast('Password must be at least 6 characters', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      addToast('New passwords do not match', 'error');
      return;
    }

    if (currentPassword === newPassword) {
      addToast('New password must be different from temporary password', 'error');
      return;
    }

    setIsLoading(true);

    try {
      // First, verify current password by attempting to sign in
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: state.user?.email || '',
        password: currentPassword
      });

      if (signInError) {
        addToast('Current password is incorrect', 'error');
        setIsLoading(false);
        return;
      }

      // Update password using Supabase auth API
      const { error: updateError } = await supabaseClient.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        addToast('Failed to update password: ' + updateError.message, 'error');
        setIsLoading(false);
        return;
      }

      // Clear must_change_password flag in profiles table (if column exists)
      try {
        const { error: profileError } = await supabaseClient
          .from('profiles')
          .update({ must_change_password: false })
          .eq('id', state.user.id);

        if (profileError) {
          // Column might not exist yet, log but don't fail
          if (profileError.code === '42703') {
            console.warn('must_change_password column does not exist yet. Please run migration script.');
          } else {
            console.error('Error updating profile:', profileError);
          }
        }
      } catch (error) {
        // Column doesn't exist, that's okay - password was changed successfully
        console.warn('Could not update must_change_password flag:', error);
      }

      addToast('Password changed successfully!', 'success');
      
      // Wait a moment for the toast, then complete
      setTimeout(() => {
        onComplete();
      }, 1000);
    } catch (error) {
      console.error('Error changing password:', error);
      addToast('Error changing password: ' + (error.message || 'Unknown error'), 'error');
      setIsLoading(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 backdrop-blur-xs">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon path="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Your Private PIN</h2>
          <p className="text-gray-600">
            For security, you must set your own private password. This cannot be bypassed.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Temporary Access Code
            </label>
            <div className="relative">
              <input
                id="currentPassword"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter the temporary code you received"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <Icon path={showCurrentPassword ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L9.88 9.88m-3.29-3.29L3 3m6.59 6.59L9.88 9.88" : "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"} className="w-5 h-5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Enter the temporary code provided by your administrator
            </p>
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Your Private PIN
            </label>
            <div className="relative">
              <input
                id="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Create a new PIN (minimum 6 characters)"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <Icon path={showNewPassword ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L9.88 9.88m-3.29-3.29L3 3m6.59 6.59L9.88 9.88" : "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"} className="w-5 h-5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Choose a PIN only you will know. Your administrator cannot see this.
            </p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Your Private PIN
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new PIN"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <Icon path={showConfirmPassword ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L9.88 9.88m-3.29-3.29L3 3m6.59 6.59L9.88 9.88" : "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"} className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
            <div className="flex items-start space-x-2">
              <Icon path="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <strong>Security Notice:</strong> After setting your private PIN, the temporary access code will no longer work. Only you will know your new PIN.
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <LoadingSpinner size="sm" text="" />
                <span className="ml-2">Updating...</span>
              </span>
            ) : (
              'Set Private PIN'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ForcePasswordReset;
