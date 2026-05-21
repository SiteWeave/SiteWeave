import UpgradeRequiredModal from './UpgradeRequiredModal';

function ProjectLimitReachedModal({ isOpen, onClose }) {
  return <UpgradeRequiredModal isOpen={isOpen} onClose={onClose} feature="project_limit" />;
}

export default ProjectLimitReachedModal;
