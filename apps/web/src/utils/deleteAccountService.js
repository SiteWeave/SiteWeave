import { clearStaleSupabaseSession } from '@siteweave/core-logic';

export const ACCOUNT_DELETED_STORAGE_KEY = 'siteweave_account_deleted';

async function readFunctionErrorBody(error) {
  const ctx = error?.context;
  if (!ctx) return null;

  if (typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body?.error) return body.error;
    } catch {
      // fall through
    }
  }

  if (typeof ctx.text === 'function') {
    try {
      const text = await ctx.text();
      if (text) {
        const body = JSON.parse(text);
        if (body?.error) return body.error;
      }
    } catch {
      // fall through
    }
  }

  return null;
}

/** Clear in-memory + persisted auth and mark login screen to show success notice. */
export async function finalizeDeletedAccountSession(supabase) {
  await clearStaleSupabaseSession(supabase);
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('siteweave_app_state');
    sessionStorage.removeItem('siteweave_user_id');
    sessionStorage.setItem(ACCOUNT_DELETED_STORAGE_KEY, '1');
  }
}

/**
 * Permanently deletes the signed-in user via the delete-user edge function.
 */
export async function deleteAccount(supabase) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('No valid session found');
  }

  const { data, error } = await supabase.functions.invoke('delete-user');

  if (data?.error) {
    throw new Error(data.error);
  }

  if (error) {
    const bodyError = await readFunctionErrorBody(error);
    if (bodyError) throw new Error(bodyError);
    throw new Error(error.message || 'Failed to delete account');
  }

  await finalizeDeletedAccountSession(supabase);
  return { success: true };
}
