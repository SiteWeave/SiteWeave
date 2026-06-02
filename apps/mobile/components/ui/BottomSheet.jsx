import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  AccessibilityInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography, touch } from '../../theme';
import PressableWithFade from '../PressableWithFade';
import ModalScrim from './ModalScrim';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function BottomSheet({
  visible,
  title,
  onClose,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
  testID,
}) {
  const insets = useSafeAreaInsets();
  const sheetTranslateY = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (visible) {
      sheetTranslateY.setValue(1);
      if (reduceMotion) {
        sheetTranslateY.setValue(0);
        return;
      }
      requestAnimationFrame(() => {
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }).start();
      });
    } else {
      sheetTranslateY.setValue(1);
    }
  }, [visible, sheetTranslateY, reduceMotion]);

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.container}>
        <ModalScrim onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboard}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, spacing.lg) },
              {
                transform: [
                  {
                    translateY: sheetTranslateY.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, SCREEN_HEIGHT],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.handle} accessibilityLabel="Sheet grabber" accessibilityRole="adjustable" />
            <View style={styles.header}>
              <PressableWithFade
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={touch.hitSlop}
                testID={testID ? `${testID}-close` : undefined}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.closeText}>✕</Text>
              </PressableWithFade>
              <Text style={styles.title}>{title}</Text>
              {onPrimary ? (
                <PressableWithFade
                  onPress={onPrimary}
                  disabled={primaryDisabled || primaryLoading}
                  style={[styles.saveBtn, (primaryDisabled || primaryLoading) && styles.saveDisabled]}
                  testID={testID ? `${testID}-save` : undefined}
                  accessibilityRole="button"
                  accessibilityLabel={primaryLabel || 'Save'}
                >
                  <Text style={[styles.saveText, (primaryDisabled || primaryLoading) && styles.saveTextDisabled]}>
                    {primaryLoading ? '…' : primaryLabel || 'Save'}
                  </Text>
                </PressableWithFade>
              ) : (
                <View style={styles.headerSpacer} />
              )}
            </View>
            <View style={styles.body}>{children}</View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboard: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: spacing.sm,
    maxHeight: '90%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  closeBtn: {
    width: touch.minSize,
    height: touch.minSize,
    borderRadius: touch.minSize / 2,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 18, color: colors.textMuted, fontWeight: '600' },
  title: {
    flex: 1,
    textAlign: 'center',
    ...typography.sectionTitle,
    fontSize: 17,
  },
  headerSpacer: { width: touch.minSize },
  saveBtn: { minWidth: touch.minSize, paddingHorizontal: spacing.md, alignItems: 'flex-end' },
  saveDisabled: { opacity: 0.4 },
  saveText: { fontSize: 17, fontWeight: '700', color: colors.primary },
  saveTextDisabled: { color: colors.textMuted },
  body: { paddingHorizontal: spacing.lg },
});
