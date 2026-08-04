import type { ComponentType } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Bot,
  BrainCircuit,
  CalendarClock,
  Check,
  Code2,
  Database,
  FileCheck2,
  FileText,
  GitBranch,
  Mail,
  PackageCheck,
  Play,
  Plug,
  Repeat2,
  Route,
  Send,
  Shield,
  ShoppingCart,
  Sparkles,
  Split,
  Table2,
  Upload,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { normalizeNodeKind } from '../nodeCapabilities';
import type { WorkflowNodeData } from '../types/workflow';
import { getClassifierHandleDefinitions } from '../utils/classifierHandles';

type NodeVisual = {
  gradient: string;
  icon: ComponentType<{ className?: string }>;
  provider: string;
  runtime: string;
};

const palette: Record<string, NodeVisual> = {
  'email-trigger': { gradient: 'from-blue-500 to-cyan-500', icon: Mail, provider: 'Gmail', runtime: 'Trigger' },
  scheduler: { gradient: 'from-violet-500 to-indigo-500', icon: CalendarClock, provider: 'Schedule', runtime: 'Timer' },
  webhook: { gradient: 'from-cyan-500 to-sky-500', icon: Plug, provider: 'Webhook', runtime: 'Ingress' },
  'file-upload': { gradient: 'from-emerald-500 to-teal-500', icon: Upload, provider: 'Upload', runtime: 'File' },
  llm: { gradient: 'from-cyan-500 to-violet-500', icon: Sparkles, provider: 'LLM', runtime: 'Model' },
  extractor: { gradient: 'from-indigo-500 to-blue-500', icon: Table2, provider: 'AI', runtime: 'Extract' },
  classifier: { gradient: 'from-purple-500 to-fuchsia-500', icon: Bot, provider: 'AI', runtime: 'Classify' },
  summarizer: { gradient: 'from-teal-500 to-emerald-500', icon: BrainCircuit, provider: 'AI', runtime: 'Summarize' },
  condition: { gradient: 'from-emerald-500 to-lime-500', icon: Split, provider: 'Logic', runtime: 'Rule' },
  router: { gradient: 'from-amber-500 to-orange-500', icon: Route, provider: 'Logic', runtime: 'Route' },
  loop: { gradient: 'from-amber-500 to-yellow-500', icon: Repeat2, provider: 'Logic', runtime: 'Iterate' },
  'send-email': { gradient: 'from-sky-500 to-blue-600', icon: Send, provider: 'SMTP', runtime: 'Action' },
  calendar: { gradient: 'from-violet-500 to-indigo-600', icon: CalendarClock, provider: 'Calendar', runtime: 'Action' },
  'http-api': { gradient: 'from-cyan-500 to-blue-600', icon: Code2, provider: 'HTTP', runtime: 'API' },
  database: { gradient: 'from-emerald-500 to-teal-600', icon: Database, provider: 'DB', runtime: 'Query' },
  'rag-incident-memory': { gradient: 'from-rose-500 to-violet-600', icon: Activity, provider: 'RAG', runtime: 'Memory' },
  supervisor: { gradient: 'from-slate-600 to-zinc-700', icon: Shield, provider: 'Ops', runtime: 'Oversight' },
  'failure-detection': { gradient: 'from-amber-500 to-orange-600', icon: AlertTriangle, provider: 'Monitoring', runtime: 'Detect' },
  'auto-healing': { gradient: 'from-emerald-500 to-green-600', icon: Activity, provider: 'Ops', runtime: 'Recover' },
  'requirement-validation': { gradient: 'from-cyan-500 to-sky-600', icon: FileCheck2, provider: 'System', runtime: 'Validate' },
  inventory: { gradient: 'from-violet-500 to-indigo-600', icon: PackageCheck, provider: 'System', runtime: 'Inventory' },
  'vendor-selection': { gradient: 'from-amber-500 to-orange-600', icon: ShoppingCart, provider: 'System', runtime: 'Vendor' },
  'budget-validation': { gradient: 'from-emerald-500 to-green-600', icon: Wallet, provider: 'System', runtime: 'Budget' },
  approval: { gradient: 'from-fuchsia-500 to-pink-600', icon: UserCheck, provider: 'Human', runtime: 'Approval' },
  'purchase-order': { gradient: 'from-rose-500 to-red-600', icon: FileText, provider: 'System', runtime: 'Order' },
};

const stateClasses: Record<NonNullable<WorkflowNodeData['executionState']>, string> = {
  waiting:
    'border-slate-200 bg-white/96 shadow-[0_18px_46px_-30px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-slate-900/96',
  current:
    'border-cyan-400 bg-cyan-50/95 shadow-glow dark:border-cyan-300/80 dark:bg-cyan-500/12',
  success:
    'border-emerald-400/70 bg-emerald-50/95 shadow-[0_18px_46px_-28px_rgba(16,185,129,0.35)] dark:bg-emerald-500/12',
  failed:
    'border-rose-400/70 bg-rose-50/95 shadow-[0_18px_46px_-28px_rgba(244,63,94,0.35)] dark:bg-rose-500/12',
};

const stateBadgeClasses: Record<NonNullable<WorkflowNodeData['executionState']>, string> = {
  waiting: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  current: 'border-cyan-300 bg-cyan-100 text-cyan-700 dark:border-cyan-400/40 dark:bg-cyan-400/10 dark:text-cyan-200',
  success: 'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-200',
  failed: 'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-200',
};

const stateLabels: Record<NonNullable<WorkflowNodeData['executionState']>, string> = {
  waiting: 'Ready',
  current: 'Running',
  success: 'Complete',
  failed: 'Failed',
};

function getVisual(kind: string) {
  return palette[kind] ?? { gradient: 'from-slate-500 to-slate-700', icon: GitBranch, provider: 'System', runtime: 'Node' };
}

function getRuntimeBadges(kind: string, data: WorkflowNodeData, visual: NodeVisual) {
  if (data.provider || data.model) {
    return {
      provider: data.provider || visual.provider,
      runtime: data.model || visual.runtime,
    };
  }

  if (kind === 'email-trigger') {
    return { provider: 'Gmail', runtime: data.folder || 'INBOX' };
  }

  if (kind === 'send-email') {
    return { provider: 'SMTP', runtime: data.useLlmOutput ? 'LLM output' : 'Custom body' };
  }

  return {
    provider: visual.provider,
    runtime: visual.runtime,
  };
}

function renderSourceHandles(kind: string, data: WorkflowNodeData) {
  if (kind === 'condition') {
    return (
      <>
        <Handle id="true" type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-emerald-400" style={{ top: '34%' }} />
        <Handle id="false" type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-rose-400" style={{ top: '70%' }} />
      </>
    );
  }

  if (kind === 'router') {
    if (Array.isArray(data.routes) && data.routes.length > 0) {
      return (
        <>
          {data.routes.map((route, index) => (
            <Handle
              key={route.route || index}
              id={route.route}
              type="source"
              position={Position.Right}
              className="!h-3 !w-3 !border-2 !border-white !bg-orange-400"
              style={{ top: `${22 + index * 18}%` }}
            />
          ))}
          <Handle id="default" type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-slate-400" style={{ top: '90%' }} />
        </>
      );
    }

    return <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-orange-400" />;
  }

  if (kind === 'classifier') {
    const handles = getClassifierHandleDefinitions(data.categories);
    return (
      <>
        {handles.map((handle) => (
          <Handle
            key={handle.id}
            id={handle.id}
            type="source"
            position={Position.Right}
            className="!h-3 !w-3 !border-2 !border-white !bg-fuchsia-400"
            style={{ top: handle.top }}
          />
        ))}
        {handles.length === 0 ? <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-fuchsia-400" /> : null}
      </>
    );
  }

  return <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-cyan-400" />;
}

function WorkflowNode({ data, selected }: NodeProps<WorkflowNodeData>) {
  const normalizedKind = normalizeNodeKind(data.kind);
  const visual = getVisual(normalizedKind);
  const Icon = visual.icon;
  const executionState: NonNullable<WorkflowNodeData['executionState']> = data.executionState ?? 'waiting';
  const badges = getRuntimeBadges(normalizedKind, data, visual);
  const StateIcon = {
    waiting: Activity,
    current: Play,
    success: Check,
    failed: X,
  }[executionState];

  return (
    <motion.div
      initial={false}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`group relative min-w-[244px] max-w-[280px] overflow-hidden rounded-3xl border p-3 text-slate-950 backdrop-blur-xl transition-colors dark:text-slate-100 ${stateClasses[executionState]} ${
        selected ? 'ring-2 ring-cyan-400/80 ring-offset-2 ring-offset-white dark:ring-offset-[#0B1220]' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-cyan-400" />
      {renderSourceHandles(normalizedKind, data)}

      <div className={`rounded-2xl bg-gradient-to-br ${visual.gradient} p-3 text-white shadow-lg shadow-slate-900/15`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/18 backdrop-blur">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{data.label}</p>
              <p className="mt-0.5 truncate text-[11px] font-medium text-white/75">{data.nodeType}</p>
            </div>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${stateBadgeClasses[executionState]}`}>
            <StateIcon className="h-3 w-3" />
            {stateLabels[executionState]}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <p className="line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{data.description}</p>

        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {badges.provider}
          </span>
          <span className="max-w-[145px] truncate rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200">
            {badges.runtime}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500 transition-colors dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
          {data.config}
        </div>
      </div>

    </motion.div>
  );
}

export default WorkflowNode;
