const PREFIX = 'siteweave_onboarding_';

export function getOnboardingPreferences(userId) {
  if (!userId) return null;
  try {
    const stored = localStorage.getItem(`${PREFIX}${userId}`);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Error reading onboarding preferences:', error);
    return null;
  }
}

export function saveOnboardingPreferences(userId, preferences) {
  if (!userId) return false;
  try {
    localStorage.setItem(`${PREFIX}${userId}`, JSON.stringify(preferences));
    return true;
  } catch (error) {
    console.error('Error saving onboarding preferences:', error);
    return false;
  }
}

export function getChecklistDismissed(userId) {
  if (!userId) return false;
  try {
    return localStorage.getItem(`${PREFIX}checklist_dismissed_${userId}`) === '1';
  } catch {
    return false;
  }
}

export function setChecklistDismissed(userId, dismissed = true) {
  if (!userId) return;
  try {
    localStorage.setItem(`${PREFIX}checklist_dismissed_${userId}`, dismissed ? '1' : '0');
  } catch (error) {
    console.error('Error saving checklist dismissal:', error);
  }
}
