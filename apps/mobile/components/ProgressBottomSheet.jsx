import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BottomSheet from './ui/BottomSheet';
import ProgressEditor from './ui/ProgressEditor';

export default function ProgressBottomSheet({
  visible,
  task,
  onClose,
  onSave,
  saving = false,
}) {
  const { t } = useTranslation();
  const initial = task?.completed
    ? 100
    : Math.max(0, Math.min(100, Number(task?.percent_complete) || 0));
  const [percent, setPercent] = useState(initial);

  useEffect(() => {
    if (visible && task) {
      setPercent(initial);
    }
  }, [visible, task?.id, initial]);

  const handleSave = () => {
    onSave?.({
      percent_complete: percent,
      completed: percent >= 100,
    });
  };

  return (
    <BottomSheet
      visible={visible}
      title={t('mobile.update_progress')}
      onClose={onClose}
      primaryLabel={t('common.save')}
      onPrimary={handleSave}
      primaryDisabled={saving}
      primaryLoading={saving}
      testID="progress-sheet"
    >
      <ProgressEditor value={percent} onChange={setPercent} compact />
    </BottomSheet>
  );
}
