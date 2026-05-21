import React from 'react';
import ProjectStreamView from '../stream/ProjectStreamView';
import FieldIssuesPanel from '../fieldIssues/FieldIssuesPanel';
import { markStreamRead } from '../../utils/streamReadState';
import { markIssuesRead } from '../../utils/issuesReadState';

export default function ProjectCollaborationView({
  project,
  supabaseClient,
  currentUserId,
  projectTasks = [],
  initialPanel = 'stream',
}) {
  const [mobilePanel, setMobilePanel] = React.useState(initialPanel);

  React.useEffect(() => {
    setMobilePanel(initialPanel);
  }, [initialPanel, project?.id]);

  React.useEffect(() => {
    if (!project?.id) return;
    markStreamRead(project.id);
    markIssuesRead(project.id);
  }, [project?.id]);

  if (!project) {
    return <p className="text-sm text-slate-500 p-6">Select a project to view updates and field issues.</p>;
  }

  return (
    <div className="flex flex-col min-h-[72vh]">
      <div className="lg:hidden shrink-0 flex border-b border-slate-200 mb-4">
        <button
          type="button"
          onClick={() => setMobilePanel('stream')}
          className={`flex-1 py-2 text-sm font-medium border-b-2 ${
            mobilePanel === 'stream'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500'
          }`}
        >
          Stream
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel('issues')}
          className={`flex-1 py-2 text-sm font-medium border-b-2 ${
            mobilePanel === 'issues'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500'
          }`}
        >
          Field issues
        </button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-4 lg:divide-x lg:divide-slate-200">
        <div
          className={`min-h-[320px] lg:min-h-0 lg:pr-4 ${
            mobilePanel === 'issues' ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'
          }`}
        >
          <ProjectStreamView
            project={project}
            supabaseClient={supabaseClient}
            currentUserId={currentUserId}
            embedded
          />
        </div>
        <div
          className={`min-h-[320px] lg:min-h-0 ${
            mobilePanel === 'stream' ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'
          }`}
        >
          <FieldIssuesPanel
            projectId={project.id}
            project={project}
            projectTasks={projectTasks}
            embedded
          />
        </div>
      </div>
    </div>
  );
}
