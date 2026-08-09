import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Updates from 'expo-updates';
import { captureException } from '../utils/sentry';
import { colors, radius, spacing, touch } from '../theme';
import { Text } from './ui/Text';

export default class AppErrorBoundary extends React.Component {
  state = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    captureException(error, { contexts: { react: { componentStack: info?.componentStack } } });
  }

  handleRetry = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      this.setState(({ retryKey }) => ({ error: null, retryKey: retryKey + 1 }));
    }
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.screen}>
          <View style={styles.card}>
            <Text style={styles.title}>SiteWeave hit an unexpected problem</Text>
            <Text style={styles.body}>
              Your work is still saved. Reload the app to continue.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={this.handleRetry}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Reload app</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: spacing.xl,
    gap: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  body: { color: colors.textMuted, lineHeight: 22 },
  button: {
    minHeight: touch.minSize,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  buttonText: { color: colors.white, fontWeight: '700' },
});
