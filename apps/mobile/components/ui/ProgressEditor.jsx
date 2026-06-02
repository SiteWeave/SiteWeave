import { View, TextInput, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { colors, spacing, touch } from '../../theme';
import { useBranding } from '../../context/BrandingContext';
import PressableWithFade from '../PressableWithFade';
import { useHaptics } from '../../hooks/useHaptics';

function clampPercent(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export default function ProgressEditor({ value = 0, onChange, showMarkComplete = true, compact = false }) {
  const { t } = useTranslation();
  const { primaryColor } = useBranding();
  const haptics = useHaptics();
  const [percent, setPercent] = useState(clampPercent(value));
  const [inputText, setInputText] = useState(String(clampPercent(value)));

  useEffect(() => {
    const v = clampPercent(value);
    setPercent(v);
    setInputText(String(v));
  }, [value]);

  const apply = (next) => {
    const v = clampPercent(next);
    const wasComplete = percent >= 100;
    setPercent(v);
    setInputText(String(v));
    onChange?.(v);
    if (v >= 100 && !wasComplete) {
      haptics.success();
    }
  };

  const step = (delta) => apply(percent + delta);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={[styles.readout, compact && styles.readoutCompact]}>{percent}%</Text>

      <Slider
        style={[styles.slider, compact && styles.sliderCompact]}
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={percent}
        onValueChange={(v) => apply(v)}
        minimumTrackTintColor={primaryColor}
        maximumTrackTintColor={colors.border}
        thumbTintColor={primaryColor}
      />

      <View style={styles.stepperRow}>
        <PressableWithFade style={styles.stepBtn} onPress={() => step(-1)}>
          <Text style={styles.stepLabel}>−</Text>
        </PressableWithFade>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          onBlur={() => apply(inputText)}
          keyboardType="number-pad"
          maxLength={3}
          selectTextOnFocus
        />
        <PressableWithFade style={styles.stepBtn} onPress={() => step(1)}>
          <Text style={styles.stepLabel}>+</Text>
        </PressableWithFade>
      </View>

      {showMarkComplete ? (
        <PressableWithFade style={[styles.completeRow, compact && styles.completeRowCompact]} onPress={() => apply(100)}>
          <Text variant="bodyMedium" style={{ color: colors.primary }}>
            {t('mobile.mark_complete_percent')}
          </Text>
        </PressableWithFade>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.md },
  wrapCompact: { paddingVertical: spacing.sm },
  readout: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  readoutCompact: {
    fontSize: 28,
    marginBottom: spacing.sm,
  },
  slider: { width: '100%', height: 48 },
  sliderCompact: { height: 36 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  stepBtn: {
    width: touch.minSize,
    height: touch.minSize,
    borderRadius: touch.minSize / 2,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { fontSize: 24, fontWeight: '600', color: colors.text },
  input: {
    minWidth: 72,
    height: touch.minSize,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
  },
  completeRow: {
    marginTop: spacing.lg,
    minHeight: touch.minRowHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeRowCompact: {
    marginTop: spacing.md,
    minHeight: touch.minSize,
  },
});
