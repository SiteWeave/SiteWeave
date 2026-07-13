/** Legacy route — redirects to the combined permissions onboarding screen. */
import { Redirect } from 'expo-router';

export default function NotificationPermissionScreen() {
  return <Redirect href="/(auth)/permissions" />;
}
