import {
  COVERAGE_LABELS,
  STAGE_LABELS,
  TASK_STATUS_LABELS,
  type CaseStage,
  type CoverageType,
  type TaskStatus,
} from '@manage/shared';

const STAGE_TONE: Record<CaseStage, string> = {
  reception: '',
  assessment: '',
  awaiting_approval: 'chip-amber',
  awaiting_parts: 'chip-amber',
  in_repair: 'chip-blue',
  quality_control: 'chip-blue',
  ready_for_delivery: 'chip-green',
  delivered: 'chip-dark',
};

export function StageChip({ stage }: { stage: CaseStage }) {
  return <span className={`chip ${STAGE_TONE[stage]}`}>{STAGE_LABELS[stage]}</span>;
}

export function CoverageChip({ coverage }: { coverage: CoverageType }) {
  return <span className={`chip${coverage === 'unknown' ? ' chip-amber' : ''}`}>{COVERAGE_LABELS[coverage]}</span>;
}

const TASK_TONE: Record<TaskStatus, string> = {
  pending: '',
  in_progress: 'chip-blue',
  blocked: 'chip-red',
  done: 'chip-amber',
  approved: 'chip-green',
};

export function TaskStatusChip({ status }: { status: TaskStatus }) {
  return <span className={`chip ${TASK_TONE[status]}`}>{TASK_STATUS_LABELS[status]}</span>;
}
