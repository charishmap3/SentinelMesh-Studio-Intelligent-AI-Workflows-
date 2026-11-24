import { motion } from 'framer-motion';
import { Activity, AlertCircle, Boxes, FileText, Loader2, SquareTerminal, Clock3, CheckCircle2, ShieldAlert } from 'lucide-react';
import WorkflowHealthCard from './WorkflowHealthCard';
import IncidentPanel from './IncidentPanel';
import HealingPanel from './HealingPanel';
import ExecutionLog from './ExecutionLog';
import ApprovalPanel from './ApprovalPanel';
import type { WorkflowExecutionResult } from '../types/workflow';

type ExecutionPanelProps = {
  result: WorkflowExecutionResult | null;
  isExecuting: boolean;
  errorMessage: string | null;
  // new: nodes and approval handlers for approval UI
  nodes?: Array<{ id: string; data: { kind?: string; label?: string } }>;
  executeWorkflow?: () => Promise<void>;
  onApprove?: (approver?: string, reason?: string) => Promise<void>;
  onReject?: (rejectedBy?: string, reason?: string) => Promise<void>;
  executionContext?: any;
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

function SupervisorMetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <motion.div whileHover={{ y: -3 }} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900/70">
      <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">{value}</p>
    </motion.div>
  );
}

function renderSafeCell(value: unknown) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  return <pre className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-200">{JSON.stringify(value, null, 2)}</pre>;
}

function ExecutionPanel({ result, isExecuting, errorMessage, nodes = [], onApprove, onReject }: ExecutionPanelProps) {
  const nodeOutputs = result?.node_outputs?.filter((entry) => entry && typeof entry.outputs === 'object' && Object.keys(entry.outputs).length > 0) ?? [];
  const fallbackOutputs = [
    ...(result?.extracted_data ? [{ title: 'Extracted Data', value: result.extracted_data }] : []),
    ...(result?.classification ? [{ title: 'Classification', value: result.classification }] : []),
    ...(result?.summary ? [{ title: 'Summary', value: result.summary }] : []),
  ];
  const hasOutputs = nodeOutputs.length > 0 || fallbackOutputs.length > 0;

  // compute a light-weight timeline derived from result and nodes
  const nodesMap = new Map<string, { id: string; data: { kind?: string; label?: string } }>();
  (nodes ?? []).forEach((n) => nodesMap.set(n.id, n));

  function getNodeStatus(nodeId: string) {
    if (!result) return 'pending';
    if (result.failed_node_ids?.includes(nodeId)) return 'failed';
    if (result.executed_node_ids?.includes(nodeId)) return 'success';
    if (result.current_node_id === nodeId) return 'current';
    return 'pending';
  }

  // attempt to extract timestamps per node from execution log strings
  function getNodeTiming(nodeId: string) {
    const timing = { start: null as Date | null, end: null as Date | null };
    if (!result?.execution_log?.length) return timing;

    for (const raw of result.execution_log) {
      const tsMatch = raw.match(/^([0-9T:\-+.Z]+)\s*/);
      const lower = raw.toLowerCase();
      if (raw.includes(nodeId) || lower.includes(nodesMap.get(nodeId)?.data.label?.toLowerCase() ?? '')) {
        if (!timing.start && tsMatch) timing.start = new Date(tsMatch[1]);
        if (tsMatch) timing.end = new Date(tsMatch[1]);
      }
    }
    return timing;
  }

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

          {(result.supervisor_summary || result.supervisor_metrics || result.supervisor_timeline?.length || result.supervisor_node_details?.length) ? (
            <section className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/50">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200">
                    <ShieldAlert className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase text-blue-600 dark:text-cyan-300">Supervisor</p>
                    <h4 className="text-base font-semibold text-slate-950 dark:text-white">Workflow Monitoring</h4>
                  </div>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                  Live metrics and timeline
                </span>
              </div>

              {result.supervisor_summary ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
                    <span>Supervisor Summary</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{result.supervisor_summary}</p>
                </div>
              ) : null}

              {result.supervisor_metrics ? (
                <div className="grid gap-3 xl:grid-cols-3">
                  <SupervisorMetricCard label="Total Execution Time" value={`${result.supervisor_metrics.total_execution_time_ms} ms`} />
                  <SupervisorMetricCard label="Average Node Latency" value={`${result.supervisor_metrics.average_node_latency_ms} ms`} />
                  <SupervisorMetricCard label="Workflow Completion" value={`${result.supervisor_metrics.workflow_completion_pct}%`} />
                  <SupervisorMetricCard label="Completed Nodes" value={result.supervisor_metrics.completed_nodes} />
                  <SupervisorMetricCard label="Failed Nodes" value={result.supervisor_metrics.failed_nodes} />
                  <SupervisorMetricCard label="Pending Nodes" value={result.supervisor_metrics.pending_nodes} />
                  <SupervisorMetricCard label="Retries" value={result.supervisor_metrics.retry_count} />
                  <SupervisorMetricCard label="Current Running Node" value={result.supervisor_metrics.current_running_node ?? '—'} />
                </div>
              ) : null}

              {result.supervisor_timeline?.length ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
                      <Activity className="h-4 w-4 text-blue-600 dark:text-cyan-300" />
                      <span>Supervisor Timeline</span>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                      {result.supervisor_timeline.length} events
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {result.supervisor_timeline.map((entry, index) => (
                      <div key={`sup-timeline-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/80">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{entry.event ?? 'Event'}</p>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{entry.timestamp ?? ''}</span>
                        </div>
                        {entry.status ? <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{entry.status}</p> : null}
                        {entry.detail ? <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{entry.detail}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.supervisor_node_details?.length ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
                      <FileText className="h-4 w-4 text-violet-500 dark:text-violet-300" />
                      <span>Node Details</span>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                      {result.supervisor_node_details.length} nodes
                    </span>
                  </div>
                  <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
                    <table className="min-w-full border-collapse text-left text-sm text-slate-600 dark:text-slate-300">
                      <thead className="bg-slate-100 text-xs uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                        <tr>
                          <th className="px-3 py-3">Node</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Duration</th>
                          <th className="px-3 py-3">Warnings</th>
                          <th className="px-3 py-3">Errors</th>
                          <th className="px-3 py-3">Output</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.supervisor_node_details.map((node, index) => (
                          <tr key={`sup-node-${index}`} className={index % 2 === 0 ? 'bg-white dark:bg-slate-900/90' : 'bg-slate-50 dark:bg-slate-950'}>
                            <td className="px-3 py-3 font-semibold text-slate-950 dark:text-white">{node.node_name ?? node.node_id ?? 'Unknown'}</td>
                            <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{node.status ?? 'Unknown'}</td>
                            <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{node.duration_ms != null ? `${node.duration_ms} ms` : '—'}</td>
                            <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{renderSafeCell(node.warning)}</td>
                            <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{renderSafeCell(node.error)}</td>
                            <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{renderSafeCell(node.output_summary)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

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

          {/* Monitoring timeline: show a compact timeline of nodes with durations */}
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800">
                <Clock3 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Execution Timeline</p>
                <h4 className="text-sm font-semibold text-slate-950 dark:text-white">Node chronology</h4>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {(nodes ?? []).map((node) => {
                const statusTag = getNodeStatus(node.id);
                const timing = getNodeTiming(node.id);
                const duration = timing.start && timing.end ? `${Math.max(0, Math.round((timing.end.getTime() - timing.start.getTime()))) }ms` : '—';
                return (
                  <div key={node.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-2">
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${statusTag === 'success' ? 'bg-emerald-400' : statusTag === 'failed' ? 'bg-rose-400' : statusTag === 'current' ? 'bg-cyan-400 animate-pulse' : 'bg-slate-300'}`} />
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">{node.data.label}</div>
                        <div className="text-xs text-slate-500">{statusTag === 'current' ? 'Running' : statusTag === 'success' ? 'Complete' : statusTag === 'failed' ? 'Failed' : 'Pending'}</div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">{duration}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* If the current node is an approval node, show the ApprovalPanel */}
          {result.current_node_id && nodes && nodes.find((n) => n.id === result.current_node_id && n.data?.kind === 'approval') ? (
            <ApprovalPanel
          nodeId={result.current_node_id}
          nodeLabel={nodes.find((n) => n.id === result.current_node_id)!.data.label ?? 'Approval'}
          lastUpdated={result.execution_log?.[0] ?? null}
          onApprove={async (payload) => {
            // call provided approval handler if available
            try {
              await onApprove?.(payload?.approver, payload?.reason);
            } catch (e) {
              // ignore - caller handles errors
            }
          }}
          onReject={async (payload) => {
            try {
              await onReject?.(payload?.rejectedBy, payload?.reason);
            } catch (e) {
              // ignore
            }
          }}
            />
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
