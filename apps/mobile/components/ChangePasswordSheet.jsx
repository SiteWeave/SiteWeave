import { useEffect, useState } from 'react';
import { StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import BottomSheet from './ui/BottomSheet';
import { Text } from './ui/Text';
import PasswordInput from './ui/PasswordInput';
import { useHaptics } from '../hooks/useHaptics';
import { colors, spacing } from '../theme';

export default function ChangePasswordSheet({ visible, onClose }) {
  const { t } = useTranslation();
  const { user, supabase } = useAuth();
  const haptics = useHaptics();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setSubmitting(false);
  }, [visible]);

  const handleClose = () => {
    if (!submitting) {
      haptics.light();
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!user || !supabase) {
      Alert.alert(t('common.error'), t('mobile.feedback_sign_in'));
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(t('common.error'), t('toast.new_passwords_do_not_match'));
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(t('common.error'), t('toast.password_min_length'));
      return;
    }

    try {
      haptics.medium();
      setSubmitting(true);

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      haptics.success();
      Alert.alert(t('common.success'), t('toast.password_changed_successfully'), [
        { text: t('common.done'), onPress: onClose },
      ]);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Error changing password:', error);
      haptics.error();
      Alert.alert(
        t('common.error'),
        t('toast.error_changing_password', { message: error?.message || t('common.error') }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = Boolean(newPassword && confirmPassword);

  return (
    <BottomSheet
      visible={visible}
      title={t('settings.change_password')}
      onClose={handleClose}
      primaryLabel={t('settings.change_password')}
      onPrimary={handleSubmit}
      primaryDisabled={submitting || !canSubmit}
      primaryLoading={submitting}
      snap="medium"
      expandOnFocus
      stickyPrimary
      testID="change-password-sheet"
    >
      <BottomSheet.Scroll>
        <Text variant="bodyMedium" style={styles.description}>
          {t('settings.security_section_desc')}
        </Text>

        <Text variant="caption" style={styles.label}>
          {t('settings.new_password')}
        </Text>
        <PasswordInput
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder={t('settings.enter_new_password')}
          showPassword={showPassword}
          onToggleShow={() => setShowPassword((v) => !v)}
          testID="change-password-new"
          autoComplete="password-new"
        />

        <Text variant="caption" style={styles.label}>
          {t('settings.confirm_new_password')}
        </Text>
        <PasswordInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder={t('settings.confirm_new_password_placeholder')}
          showPassword={showPassword}
          onToggleShow={() => setShowPassword((v) => !v)}
          testID="change-password-confirm"
          autoComplete="password-new"
        />
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  description: {
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  label: {
    marginBottom: spacing.sm,
    color: colors.textSecondary,
  },
});
