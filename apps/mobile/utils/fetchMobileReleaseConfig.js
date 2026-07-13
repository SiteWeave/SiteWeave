export async function fetchMobileReleaseConfig(supabase) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('mobile_release_config')
    .select(
      'min_native_version, latest_native_version, ios_store_url, android_store_url, force_update',
    )
    .eq('id', 'default')
    .maybeSingle();

  if (error) {
    console.warn('[AppUpdate] release config fetch failed:', error.message);
    return null;
  }

  return data;
}
