import { motion } from 'framer-motion';
import { Activity, AlertCircle, Boxes, FileText, Loader2, SquareTerminal } from 'lucide-react';
import WorkflowHealthCard from './WorkflowHealthCard';
import IncidentPanel from './IncidentPanel';
import HealingPanel from './HealingPanel';
import ExecutionLog from './ExecutionLog';
import type { WorkflowExecutionResult } from '../types/workflow';

type ExecutionPanelProps = {
  result: WorkflowExecutionResult | null;
  isExecuting: boolean;
  errorMessage: string | null;
};

function renderOutputValue(value: unknown) {
  if (typeof value === 'string') {
    return <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{value}</p>;
  }

  return (
    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function ExecutionPanel({ result, isExecuting, errorMessage }: ExecutionPanelProps) {
  const nodeOutputs = result?.node_outputs?.filter((entry) => entry && typeof entry.outputs === 'object' && Object.keys(entry.outputs).length > 0) ?? [];
  const fallbackOutputs = [
    ...(result?.extracted_data ? [{ title: 'Extracted Data', value: result.extracted_data }] : []),
    ...(result?.classification ? [{ title: 'Classification', value: result.classification }] : []),
    ...(result?.summary ? [{ title: 'Summary', value: result.summary }] : []),
  ];
  const hasOutputs = nodeOutputs.length > 0 || fallbackOutputs.length > 0;

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/50">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase text-blue-600 dark:text-cyan-300">Monitoring</p>
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">Execution Results</h3>
          </div>
        </div>
        {isExecuting ? (
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Executing
          </span>
        ) : null}
      </div>

      {isExecuting ? (
        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div className="h-full w-1/2 animate-shimmer rounded-full bg-[linear-gradient(90deg,transparent,rgba(34,211,238,0.85),transparent)] bg-[length:200%_100%]" />
        </div>
      ) : null}

      {errorMessage ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {result ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <WorkflowHealthCard result={result} />
          <IncidentPanel result={result} />
          <HealingPanel result={result} />

          {hasOutputs ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-200">
                  <Boxes className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase text-violet-600 dark:text-violet-300">Node Outputs</p>
                  <h4 className="text-sm font-semibold text-slate-950 dark:text-white">Execution Artifacts</h4>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {nodeOutputs.map((entry, index) => (
                  <div key={`${entry.node_id ?? 'node'}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <SquareTerminal className="h-4 w-4 shrink-0 text-blue-600 dark:text-cyan-300" />
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.node_type || 'Node'}</p>
                      </div>
                      {entry.node_id ? <p className="max-w-[8rem] truncate text-xs text-slate-500 dark:text-slate-500">{entry.node_id}</p> : null}
                    </div>
                    {Object.entries(entry.outputs).map(([key, value]) => (
                      <div key={key} className="mt-3">
                        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{key}</p>
                        {renderOutputValue(value)}
                      </div>
                    ))}
                  </div>
                ))}

                {nodeOutputs.length === 0
                  ? fallbackOutputs.map((entry) => (
                      <div key={entry.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-600 dark:text-cyan-300" />
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.title}</p>
                        </div>
                        {renderOutputValue(entry.value)}
                      </div>
                    ))
                  : null}
              </div>
            </section>
          ) : null}

          <ExecutionLog executionLog={result.execution_log} />
        </motion.div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm leading-6 text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
          Execute a workflow to view health, stage progress, node outputs, incidents, healing guidance, and timeline logs.
        </div>
      )}
    </section>
  );
}

export default ExecutionPanel;
