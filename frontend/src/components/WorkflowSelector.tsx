import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Copy, Edit3, FileText, MoreVertical, Play, Plus, Search, Trash2 } from 'lucide-react';
import type { SavedWorkflow } from '../types/workflow';

type WorkflowSelectorProps = {
  workflows: SavedWorkflow[];
  activeWorkflowId: string | null;
  currentWorkflowId: string | null;
  currentWorkflowName: string;
  onLoad: (workflowId: string) => void;
  onRename: (workflowId: string, newName: string) => boolean;
  onDeleteRequest: (workflowId: string) => void;
  onDuplicate: (workflowId: string) => void;
  onCreateNew: () => void;
};

function formatUpdatedAt(updatedAt?: string) {
  if (!updatedAt) return 'Modified recently';
  const date = new Date(updatedAt);
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&');
}

function renderHighlightedText(text: string, query: string) {
  if (!query.trim()) return <span>{text}</span>;
  const escaped = escapeRegExp(query.trim());
  const re = new RegExp(`(${escaped})`, 'i');
  const parts = text.split(re);
  return (
    <span>
      {parts.map((part, idx) => (re.test(part) ? <mark key={idx} className="rounded bg-yellow-200 px-0.5 font-semibold text-slate-900 dark:bg-yellow-500/20 dark:text-yellow-100">{part}</mark> : <span key={idx}>{part}</span>))}
    </span>
  );
}

export default function WorkflowSelector({
  workflows,
  activeWorkflowId,
  currentWorkflowId,
  currentWorkflowName,
  onLoad,
  onRename,
  onDeleteRequest,
  onDuplicate,
  onCreateNew,
}: WorkflowSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const normalized = query.toLowerCase();
  const filtered = useMemo(() => workflows.filter((w) => w.name.toLowerCase().includes(normalized)), [workflows, normalized]);

  // placement & sizing
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const [maxHeight, setMaxHeight] = useState(() => Math.floor((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.7));

  useEffect(() => {
    // inject scrollbar styles
    const id = 'wf-selector-scrollbar';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.innerHTML = `
      .workflow-list::-webkit-scrollbar { width: 10px; height: 8px; }
      .workflow-list::-webkit-scrollbar-track { background: transparent; }
      .workflow-list::-webkit-scrollbar-thumb { background-color: rgba(100,116,139,0.28); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
      .workflow-list { scrollbar-width: thin; }
      @media (prefers-color-scheme: dark) { .workflow-list::-webkit-scrollbar-thumb { background-color: rgba(148,163,184,0.18); } }
    `;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onDocClick = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', onDocClick);

    // compute placement
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const allowed = Math.floor(window.innerHeight * 0.7);
      if (below >= Math.min(360, allowed)) { setPlacement('bottom'); setMaxHeight(Math.min(allowed, Math.max(below, 200))); }
      else if (above > below) { setPlacement('top'); setMaxHeight(Math.min(allowed, Math.max(above, 200))); }
      else { setPlacement('bottom'); setMaxHeight(allowed); }
    }

    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isOpen, workflows.length]);

  useEffect(() => { if (editingId) setEditValue(workflows.find((w) => w.id === editingId)?.name ?? ''); }, [editingId, workflows]);
  useEffect(() => { if (isOpen) { setFocusedIndex(0); inputRef.current?.focus(); } }, [isOpen, filtered.length]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); setIsOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIndex((c) => Math.min(c + 1, Math.max(filtered.length - 1, 0))); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIndex((c) => Math.max(c - 1, 0)); return; }
    if (e.key === 'Enter' && filtered[focusedIndex]) { e.preventDefault(); onLoad(filtered[focusedIndex].id); setIsOpen(false); }
  };

  const selectedLabel = currentWorkflowId ? workflows.find((w) => w.id === currentWorkflowId)?.name ?? currentWorkflowName : 'New workflow';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="mt-1 flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-100"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="truncate">{selectedLabel}</span>
        <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><MoreVertical className="h-4 w-4" /></span>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 z-40 w-[min(32rem,calc(100vw-2rem)))] rounded-3xl border border-slate-200 bg-white shadow-premium backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95"
          onKeyDown={handleKeyDown}
          style={{ top: placement === 'bottom' ? 'calc(100% + 8px)' : undefined, bottom: placement === 'top' ? 'calc(100% + 8px)' : undefined }}
        >
          <div className="flex flex-col">
            <div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-950/95 px-4 py-3 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={onCreateNew} className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200">
                  <Plus className="h-4 w-4" /> Create New Workflow
                </button>
                <div className="relative flex-1 min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workflows..." className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white" />
                </div>
              </div>
            </div>

            <div className="workflow-list px-4 pt-3 pb-4" style={{ maxHeight: `${maxHeight}px`, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth' }}>
              <div className="space-y-3">
                {filtered.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
                    <p className="font-semibold text-slate-900 dark:text-white">No workflows found</p>
                    <p className="mt-2">Create a new workflow to get started.</p>
                  </div>
                ) : (
                  filtered.map((workflow, index) => {
                    const isActive = workflow.id === activeWorkflowId;
                    const isEditing = workflow.id === editingId;
                    const isFocused = index === focusedIndex;

                    return (
                      <div key={workflow.id} className={`group rounded-3xl border p-4 transition ${isFocused ? 'border-blue-300 bg-blue-50/70 dark:border-cyan-400/50 dark:bg-cyan-400/10' : 'border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/80'}`}>
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><FileText className="h-5 w-5" /></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="min-w-0 text-sm font-semibold text-slate-900 dark:text-white">
                                {isEditing ? (
                                  <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter') { if (onRename(workflow.id, editValue)) setEditingId(null); } if (ev.key === 'Escape') setEditingId(null); }} onBlur={() => { if (onRename(workflow.id, editValue)) setEditingId(null); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400" />
                                ) : (
                                  <button type="button" onClick={() => { onLoad(workflow.id); setIsOpen(false); }} className="text-left text-sm font-semibold text-slate-900 transition hover:text-blue-600 dark:text-slate-100 dark:hover:text-cyan-300">{renderHighlightedText(workflow.name, query)}</button>
                                )}
                              </h3>
                              {isActive && (<span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">Active</span>)}
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Modified {formatUpdatedAt(workflow.updatedAt)}</p>
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{workflow.nodes.length} Nodes • {workflow.edges.length} Edges</p>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 transition duration-200 group-hover:opacity-100">
                            <button type="button" onClick={() => { onLoad(workflow.id); setIsOpen(false); }} title="Load Workflow" className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-400/30 dark:hover:bg-cyan-400/10"><Play className="h-4 w-4" /></button>
                            <button type="button" onClick={() => { setEditingId(workflow.id); }} title="Rename Workflow" className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-400/30 dark:hover:bg-cyan-400/10"><Edit3 className="h-4 w-4" /></button>
                            <button type="button" onClick={() => onDuplicate(workflow.id)} title="Duplicate Workflow" className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-400/30 dark:hover:bg-cyan-400/10"><Copy className="h-4 w-4" /></button>
                            <button type="button" onClick={() => onDeleteRequest(workflow.id)} title="Delete Workflow" className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 dark:border-slate-700 dark:bg-slate-900 dark:text-rose-300 dark:hover:border-rose-400/50 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
