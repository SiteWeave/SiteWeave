/**
 * Guest project access (project_collaborators)
 */

export async function getUserCollaborationProjects(supabase, userId) {
  const { data, error } = await supabase
    .from('project_collaborators')
    .select(`
      project_id,
      access_level,
      projects (
        id,
        name,
        address,
        status,
        project_type,
        organization_id
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user collaboration projects:', error);
    return [];
  }
  return data || [];
}
