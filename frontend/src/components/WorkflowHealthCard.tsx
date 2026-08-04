import { motion } from 'framer-motion';
import { Activity, AlertCircle, CheckCircle2, Gauge, Info, ListChecks, ShieldAlert, XCircle } from 'lucide-react';
import type { WorkflowExecutionResult } from '../types/workflow';

type WorkflowHealthCardProps = {
  result: WorkflowExecutionResult;
};

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const toneClasses: Record<Tone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200',
  danger: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200',
  info: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200',
  neutral: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function getHealthTone(status: string): Tone {
  const normalized = status.toLowerCase();
  if (/healthy|validated|approved|generated|complete|success/.test(normalized)) return 'success';
  if (/warning|pending|running/.test(normalized)) return normalized.includes('running') ? 'info' : 'warning';
  if (/failed|rejected|critical|error/.test(normalized)) return 'danger';
  return 'neutral';
}

function getToneIcon(tone: Tone) {
  if (tone === 'success') return CheckCircle2;
  if (tone === 'warning') return AlertCircle;
  if (tone === 'danger') return XCircle;
  if (tone === 'info') return Activity;
  return Info;
}

function MetricCard({ label, value, tone, icon: Icon }: { label: string; value: string | number; tone: Tone; icon: typeof Activity }) {
  const ToneIcon = getToneIcon(tone);

  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900/70"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
          <Icon className="h-4 w-4" />
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${toneClasses[tone]}`}>
          <ToneIcon className="h-3 w-3" />
          {tone}
        </span>
      </div>
      <p className="mt-4 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 break-words text-xl font-semibold text-slate-950 dark:text-white">{value}</p>
    </motion.div>
  );
}

function StageChips({ title, stages, tone }: { title: string; stages: string[]; tone: Tone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{title}</p>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}>{stages.length}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {stages.length ? (
          stages.map((stage) => (
            <span key={stage} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}>
              {stage}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            None
          </span>
        )}
      </div>
    </div>
  );
}

function WorkflowHealthCard({ result }: WorkflowHealthCardProps) {
  const firstIncident = result.incident_matches[0];
  const totalStages = result.completed_stages.length + result.failed_stages.length;
  const progressPercent = totalStages === 0 ? 0 : Math.round((result.completed_stages.length / totalStages) * 100);
  const healthTone = getHealthTone(result.workflow_health);
  const executionTone = getHealthTone(result.execution_status);
  const severity = firstIncident?.severity ?? result.failure_severity ?? 'None';
  const category = firstIncident?.failure_category ?? result.failure_category ?? 'None';

  const metrics = [
    { label: 'Workflow Health', value: result.workflow_health, tone: healthTone, icon: Gauge },
    { label: 'Execution Status', value: result.execution_status, tone: executionTone, icon: Activity },
    { label: 'Severity', value: severity, tone: getHealthTone(severity), icon: ShieldAlert },
    { label: 'Failure Category', value: category, tone: category === 'None' ? 'neutral' : 'warning', icon: AlertCircle },
  ] satisfies Array<{ label: string; value: string; tone: Tone; icon: typeof Activity }>;

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/50">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200">
            <ListChecks className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase text-blue-600 dark:text-cyan-300">Workflow Health</p>
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">Execution Dashboard</h3>
          </div>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${toneClasses[healthTone]}`}>
          {result.workflow_health}
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950 dark:text-white">Stage Progress</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Completed stages over observed stages.</p>
          </div>
          <span className="text-sm font-semibold text-slate-950 dark:text-white">{progressPercent}%</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500"
          />
        </div>
        <div className="mt-4 grid gap-3">
          <StageChips title="Completed Stages" stages={result.completed_stages} tone="success" />
          <StageChips title="Failed Stages" stages={result.failed_stages} tone="danger" />
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
          <Info className="h-4 w-4 text-blue-600 dark:text-cyan-300" />
          Workflow Summary
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{result.workflow_summary}</p>
      </div>
    </section>
  );
}

export default WorkflowHealthCard;
