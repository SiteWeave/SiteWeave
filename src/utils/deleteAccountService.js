/**
 * Permanently deletes the signed-in user via the delete-user edge function.
 */
export async function deleteAccount(supabase) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('No valid session found');
  }

  const { data, error } = await supabase.functions.invoke('delete-user', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (data?.error) {
    throw new Error(data.error);
  }

  if (error) {
    const ctx = error.context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        if (body?.error) throw new Error(body.error);
      } catch (parseErr) {
        if (parseErr?.message && parseErr.message !== error.message) throw parseErr;
      }
    }
    throw new Error(error.message || 'Failed to delete account');
  }

  await supabase.auth.signOut({ scope: 'local' });
  return { success: true };
}
