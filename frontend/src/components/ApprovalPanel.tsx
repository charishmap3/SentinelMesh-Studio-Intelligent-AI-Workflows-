import { useState } from 'react';
import { Check, X } from 'lucide-react';

type ApprovalPanelProps = {
  nodeId: string;
  nodeLabel: string;
  onApprove: (payload?: { approver?: string; reason?: string }) => Promise<void> | void;
  onReject: (payload?: { rejectedBy?: string; reason?: string }) => Promise<void> | void;
  lastUpdated?: string | null;
};

export default function ApprovalPanel({ nodeId: _nodeId, nodeLabel, onApprove, onReject, lastUpdated }: ApprovalPanelProps) {
  const [approver, setApprover] = useState('');
  const [reason, setReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    try {
      setIsProcessing(true);
      await onApprove({ approver: approver || 'User', reason });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    try {
      setIsProcessing(true);
      await onReject({ rejectedBy: approver || 'User', reason });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-100 text-fuchsia-600">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 14l9-5-9-5-9 5 9 5z" />
            <path d="M12 14l6.16-3.422" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-fuchsia-600">Pending Approval</p>
          <h3 className="text-base font-semibold text-slate-950 dark:text-white">{nodeLabel}</h3>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500">Approver name</label>
          <input value={approver} onChange={(e) => setApprover(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/50" placeholder="Your name" />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500">Approval reason</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/50" placeholder="Optional note for the approval" />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">Requested: {lastUpdated ?? '—'}</div>
          <div className="flex items-center gap-2">
            <button disabled={isProcessing} onClick={handleReject} className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:shadow-sm disabled:opacity-60 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
              <X className="h-4 w-4" /> Reject
            </button>
            <button disabled={isProcessing} onClick={handleApprove} className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:shadow-sm disabled:opacity-60 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
              <Check className="h-4 w-4" /> Approve
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
