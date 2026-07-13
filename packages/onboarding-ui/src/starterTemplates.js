/**
 * Built-in starter project templates for new organizations.
 * Seeded once when an org has zero templates.
 */

function isoToday() {
  return new Date().toISOString().split('T')[0];
}

function shiftFromStart(startDate, days) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function buildStructure(phases, taskDefs, dependencies = []) {
  return { phases, tasks: taskDefs, dependencies };
}

export const STARTER_TEMPLATES = [
  {
    name: 'Residential new build',
    description: 'Foundation through closeout for a single-family new construction job.',
    structure: () => {
      const start = isoToday();
      return buildStructure(
        [
          { name: 'Pre-construction', order: 0 },
          { name: 'Foundation', order: 1 },
          { name: 'Framing', order: 2 },
          { name: 'MEP rough-in', order: 3 },
          { name: 'Finishes', order: 4 },
          { name: 'Closeout', order: 5 },
        ],
        [
          { text: 'Permits & site logistics', start_date: start, due_date: shiftFromStart(start, 14), duration_days: 14, is_milestone: false, priority: 'high' },
          { text: 'Foundation pour', start_date: shiftFromStart(start, 14), due_date: shiftFromStart(start, 28), duration_days: 14, is_milestone: false, priority: 'high' },
          { text: 'Frame & dry-in', start_date: shiftFromStart(start, 28), due_date: shiftFromStart(start, 56), duration_days: 28, is_milestone: false, priority: 'medium' },
          { text: 'Rough MEP', start_date: shiftFromStart(start, 56), due_date: shiftFromStart(start, 70), duration_days: 14, is_milestone: false, priority: 'medium' },
          { text: 'Interior finishes', start_date: shiftFromStart(start, 70), due_date: shiftFromStart(start, 98), duration_days: 28, is_milestone: false, priority: 'medium' },
          { text: 'Final walkthrough', start_date: shiftFromStart(start, 98), due_date: shiftFromStart(start, 105), duration_days: 7, is_milestone: true, priority: 'high' },
        ],
        [
          { predecessor_index: 0, successor_index: 1, dependency_type: 'finish_to_start', lag_days: 0 },
          { predecessor_index: 1, successor_index: 2, dependency_type: 'finish_to_start', lag_days: 0 },
          { predecessor_index: 2, successor_index: 3, dependency_type: 'finish_to_start', lag_days: 0 },
          { predecessor_index: 3, successor_index: 4, dependency_type: 'finish_to_start', lag_days: 0 },
          { predecessor_index: 4, successor_index: 5, dependency_type: 'finish_to_start', lag_days: 0 },
        ],
      );
    },
  },
  {
    name: 'Residential remodel',
    description: 'Kitchen/bath or whole-home remodel with demo through punch list.',
    structure: () => {
      const start = isoToday();
      return buildStructure(
        [
          { name: 'Planning', order: 0 },
          { name: 'Demo', order: 1 },
          { name: 'Build', order: 2 },
          { name: 'Punch list', order: 3 },
        ],
        [
          { text: 'Design & selections', start_date: start, due_date: shiftFromStart(start, 10), duration_days: 10, is_milestone: false, priority: 'high' },
          { text: 'Demo & protection', start_date: shiftFromStart(start, 10), due_date: shiftFromStart(start, 17), duration_days: 7, is_milestone: false, priority: 'medium' },
          { text: 'Rough & finish work', start_date: shiftFromStart(start, 17), due_date: shiftFromStart(start, 45), duration_days: 28, is_milestone: false, priority: 'medium' },
          { text: 'Final punch & turnover', start_date: shiftFromStart(start, 45), due_date: shiftFromStart(start, 52), duration_days: 7, is_milestone: true, priority: 'high' },
        ],
        [
          { predecessor_index: 0, successor_index: 1, dependency_type: 'finish_to_start', lag_days: 0 },
          { predecessor_index: 1, successor_index: 2, dependency_type: 'finish_to_start', lag_days: 0 },
          { predecessor_index: 2, successor_index: 3, dependency_type: 'finish_to_start', lag_days: 0 },
        ],
      );
    },
  },
  {
    name: 'Commercial TI',
    description: 'Tenant improvement fit-out from mobilization to certificate of occupancy.',
    structure: () => {
      const start = isoToday();
      return buildStructure(
        [
          { name: 'Mobilization', order: 0 },
          { name: 'Core & shell tie-in', order: 1 },
          { name: 'Build-out', order: 2 },
          { name: 'Commissioning', order: 3 },
        ],
        [
          { text: 'Site setup & safety plan', start_date: start, due_date: shiftFromStart(start, 7), duration_days: 7, is_milestone: false, priority: 'high' },
          { text: 'MEP & fire protection rough', start_date: shiftFromStart(start, 7), due_date: shiftFromStart(start, 28), duration_days: 21, is_milestone: false, priority: 'high' },
          { text: 'Partitions & finishes', start_date: shiftFromStart(start, 28), due_date: shiftFromStart(start, 49), duration_days: 21, is_milestone: false, priority: 'medium' },
          { text: 'Inspections & CO', start_date: shiftFromStart(start, 49), due_date: shiftFromStart(start, 56), duration_days: 7, is_milestone: true, priority: 'high' },
        ],
        [
          { predecessor_index: 0, successor_index: 1, dependency_type: 'finish_to_start', lag_days: 0 },
          { predecessor_index: 1, successor_index: 2, dependency_type: 'finish_to_start', lag_days: 0 },
          { predecessor_index: 2, successor_index: 3, dependency_type: 'finish_to_start', lag_days: 0 },
        ],
      );
    },
  },
];

/**
 * Seed starter templates for an org if none exist.
 * @returns {Promise<{ seeded: boolean, count: number }>}
 */
export async function seedStarterTemplatesIfNeeded(supabase, organizationId, userId) {
  if (!supabase || !organizationId || !userId) {
    return { seeded: false, count: 0 };
  }

  const { count, error: countError } = await supabase
    .from('project_templates')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  if (countError) {
    console.warn('seedStarterTemplatesIfNeeded count:', countError);
    return { seeded: false, count: 0 };
  }

  if ((count ?? 0) > 0) {
    return { seeded: false, count: 0 };
  }

  const rows = STARTER_TEMPLATES.map((template) => ({
    organization_id: organizationId,
    name: template.name,
    description: template.description,
    created_by_user_id: userId,
    structure: template.structure(),
  }));

  const { error } = await supabase.from('project_templates').insert(rows);
  if (error) {
    console.warn('seedStarterTemplatesIfNeeded insert:', error);
    return { seeded: false, count: 0 };
  }

  return { seeded: true, count: rows.length };
}

/**
 * Optional sample project loader — creates one labeled demo project from the first starter template.
 */
export async function loadSampleProjectIfRequested(supabase, organizationId, userId, createProjectFromTemplate) {
  if (!createProjectFromTemplate) return { success: false };

  const { data: templates } = await supabase
    .from('project_templates')
    .select('id, name')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
    .limit(1);

  const template = templates?.[0];
  if (!template) return { success: false, error: 'No templates available' };

  const startDate = isoToday();
  return createProjectFromTemplate(
    supabase,
    template.id,
    organizationId,
    userId,
    'Sample job (remove anytime)',
    '123 Demo Street',
    undefined,
    startDate,
  );
}
