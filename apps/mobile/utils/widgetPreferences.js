import AsyncStorage from '@react-native-async-storage/async-storage';

const PINNED_PROJECT_KEY = 'siteweave_widget_pinned_project_v1';

export async function getPinnedProjectId() {
  try {
    const value = await AsyncStorage.getItem(PINNED_PROJECT_KEY);
    return value || null;
  } catch {
    return null;
  }
}

export async function setPinnedProjectId(projectId) {
  try {
    if (!projectId) {
      await AsyncStorage.removeItem(PINNED_PROJECT_KEY);
      return;
    }
    await AsyncStorage.setItem(PINNED_PROJECT_KEY, String(projectId));
  } catch {
    // ignore storage errors
  }
}
