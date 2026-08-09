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

function checklistDismissKey(userId, organizationId) {
  if (organizationId) {
    return `${PREFIX}checklist_dismissed_${userId}_${organizationId}`;
  }
  // Legacy user-only key (pre-org-scoped dismiss)
  return `${PREFIX}checklist_dismissed_${userId}`;
}

export function getChecklistDismissed(userId, organizationId = null) {
  if (!userId) return false;
  try {
    if (organizationId) {
      const scoped = localStorage.getItem(checklistDismissKey(userId, organizationId));
      if (scoped != null) return scoped === '1';
    }
    return localStorage.getItem(checklistDismissKey(userId, null)) === '1';
  } catch {
    return false;
  }
}

export function setChecklistDismissed(userId, dismissed = true, organizationId = null) {
  if (!userId) return;
  try {
    localStorage.setItem(checklistDismissKey(userId, organizationId), dismissed ? '1' : '0');
  } catch (error) {
    console.error('Error saving checklist dismissal:', error);
  }
}
