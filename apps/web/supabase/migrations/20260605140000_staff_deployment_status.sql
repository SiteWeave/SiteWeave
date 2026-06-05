-- Normalize staff deployment status; trade partners get no deployment tracking.

UPDATE contacts SET status = 'available'
  WHERE type = 'Team'
  AND (status IS NULL OR status IN ('Available', 'Offline', 'Inactive'));

UPDATE contacts SET status = 'assigned'
  WHERE type = 'Team' AND status IN ('Busy', 'On Site');

UPDATE contacts SET status = 'off'
  WHERE type = 'Team' AND status = 'Unavailable';

UPDATE contacts SET status = 'pto'
  WHERE type = 'Team' AND status = 'On Leave';

UPDATE contacts SET status = NULL WHERE type = 'Subcontractor';

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS primary_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN contacts.status IS 'Staff crew deployment: assigned, available, off, pto. NULL for trade partners.';
COMMENT ON COLUMN contacts.primary_project_id IS 'Primary job site when deployment status is assigned.';
COMMENT ON COLUMN contacts.status_updated_at IS 'When deployment status was last set.';
