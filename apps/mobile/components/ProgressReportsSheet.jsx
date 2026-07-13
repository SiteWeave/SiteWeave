import ProgressReportsPanel from './ProgressReportsPanel';

export default function ProgressReportsSheet({
  visible,
  onClose,
  supabase,
  organizationId,
  projectId,
  projectName,
  userId,
}) {
  return (
    <ProgressReportsPanel
      active={visible}
      embedded={false}
      onClose={onClose}
      supabase={supabase}
      organizationId={organizationId}
      projectId={projectId}
      projectName={projectName}
      userId={userId}
    />
  );
}
