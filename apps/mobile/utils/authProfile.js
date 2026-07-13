import AsyncStorage from '@react-native-async-storage/async-storage';

/** Display name from auth user metadata (OAuth or email signup). */
export function getAuthDisplayName(user) {
  if (!user) return '';
  const meta = user.user_metadata || {};
  return (meta.full_name || meta.name || '').trim();
}

/** True when the user still needs to confirm or enter their name. */
export function needsProfileCompletion(user) {
  return !getAuthDisplayName(user);
}

const PENDING_SIGNUP_PROFILE_KEY = 'siteweave_pending_signup_profile';

/** Sign-up OAuth users still need avatar / account-intent setup even when name exists. */
export async function setPendingSignupProfileSetup(pending) {
  if (pending) {
    await AsyncStorage.setItem(PENDING_SIGNUP_PROFILE_KEY, '1');
  } else {
    await AsyncStorage.removeItem(PENDING_SIGNUP_PROFILE_KEY);
  }
}

export async function hasPendingSignupProfileSetup() {
  try {
    return (await AsyncStorage.getItem(PENDING_SIGNUP_PROFILE_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Keep linked contact record in sync with the user's chosen name. */
export async function syncContactName(supabase, userId, fullName) {
  if (!supabase || !userId || !fullName?.trim()) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('contact_id')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.contact_id) {
    await supabase.from('contacts').update({ name: fullName.trim() }).eq('id', profile.contact_id);
  }
}
