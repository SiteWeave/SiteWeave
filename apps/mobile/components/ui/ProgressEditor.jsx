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

export default function ProgressEditor({
  value = 0,
  onChange,
  showMarkComplete = true,
  compact = false,
  detail = false,
}) {
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

  const sliderEl = (
    <Slider
      style={[
        styles.slider,
        compact && styles.sliderCompact,
        detail && styles.sliderDetail,
        detail && styles.sliderDetailInline,
      ]}
      minimumValue={0}
      maximumValue={100}
      step={1}
      value={percent}
      onValueChange={(v) => apply(v)}
      minimumTrackTintColor={primaryColor}
      maximumTrackTintColor={colors.border}
      thumbTintColor={primaryColor}
    />
  );

  const readoutEl = (
    <Text
      style={[
        styles.readout,
        compact && styles.readoutCompact,
        detail && styles.readoutDetail,
        detail && styles.readoutDetailInline,
      ]}
    >
      {percent}%
    </Text>
  );

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, detail && styles.wrapDetail]}>
      {detail ? (
        <View style={styles.detailRow}>
          {sliderEl}
          {readoutEl}
        </View>
      ) : (
        <>
          {readoutEl}
          {sliderEl}
        </>
      )}

      {!detail ? (
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
      ) : null}

      {showMarkComplete ? (
        <PressableWithFade
          style={[styles.completeRow, compact && styles.completeRowCompact, detail && styles.completeRowDetail]}
          onPress={() => apply(100)}
        >
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
  wrapDetail: { paddingVertical: spacing.xs },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  readout: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
    fontVariant: 'tabular-nums',
  },
  readoutCompact: {
    fontSize: 28,
    marginBottom: spacing.sm,
  },
  readoutDetail: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  readoutDetailInline: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 0,
    textAlign: 'right',
    minWidth: 44,
    includeFontPadding: false,
  },
  slider: { width: '100%', height: 48 },
  sliderCompact: { height: 36 },
  sliderDetail: { height: 32 },
  sliderDetailInline: {
    flex: 1,
    height: 40,
    minWidth: 0,
  },
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
    fontVariant: 'tabular-nums',
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
  completeRowDetail: {
    marginTop: spacing.sm,
    minHeight: touch.minSize - 8,
  },
});
