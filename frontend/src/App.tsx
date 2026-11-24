import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  GitBranch,
  LayoutDashboard,
  PanelLeftClose,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import ExecutionPanel from './components/ExecutionPanel';
import PropertiesPanel from './components/PropertiesPanel';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import TemplateExecutionDialog from './components/TemplateExecutionDialog';
import TemplateGalleryModal from './components/TemplateGalleryModal';
import WorkflowCanvas from './components/WorkflowCanvas';
import WorkflowSelector from './components/WorkflowSelector';
import { useTheme } from './hooks/useTheme';
import { useWorkflow } from './hooks/useWorkflow';
import { containsHiddenUiNode } from './nodeCatalog';
import { getExecutionEligibility } from './nodeCapabilities';
import { workflowTemplates } from './templates/workflowTemplates';

const STORAGE_KEY = 'sentinelmesh-panel-widths';
const DEFAULT_PANEL_WIDTHS = {
  sidebarWidth: 288,
  canvasWidth: 820,
  inspectorWidth: 390,
};

type ToastTone = 'success' | 'error' | 'warning' | 'info';

type ToastMessage = {
  id: string;
  message: string;
  tone: ToastTone;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getStoredPanelWidths() {
  if (typeof window === 'undefined') {
    return DEFAULT_PANEL_WIDTHS;
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return DEFAULT_PANEL_WIDTHS;
    }

    const parsed = JSON.parse(saved) as Partial<typeof DEFAULT_PANEL_WIDTHS>;
    return {
      sidebarWidth: parsed.sidebarWidth ?? DEFAULT_PANEL_WIDTHS.sidebarWidth,
      canvasWidth: parsed.canvasWidth ?? DEFAULT_PANEL_WIDTHS.canvasWidth,
      inspectorWidth: parsed.inspectorWidth ?? DEFAULT_PANEL_WIDTHS.inspectorWidth,
    };
  } catch {
    return DEFAULT_PANEL_WIDTHS;
  }
}

function getToastTone(message: string): ToastTone {
  const normalizedMessage = message.toLowerCase();
  if (/failed|error|unavailable/.test(normalizedMessage)) {
    return 'error';
  }
  if (/blocked|unsupported|warning/.test(normalizedMessage)) {
    return 'warning';
  }
  if (/saved|loaded|exported|executed|added|removed|started|cleared/.test(normalizedMessage)) {
    return 'success';
  }
  return 'info';
}

function ToastStack({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  const toneStyles: Record<ToastTone, string> = {
    success: 'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-400/30 dark:bg-slate-900 dark:text-emerald-200',
    error: 'border-rose-200 bg-white text-rose-700 dark:border-rose-400/30 dark:bg-slate-900 dark:text-rose-200',
    warning: 'border-amber-200 bg-white text-amber-700 dark:border-amber-400/30 dark:bg-slate-900 dark:text-amber-200',
    info: 'border-blue-200 bg-white text-blue-700 dark:border-cyan-400/30 dark:bg-slate-900 dark:text-cyan-200',
  };
  const toneIcons = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertCircle,
    info: Activity,
  };

  return (
    <div className="pointer-events-none fixed right-4 top-24 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = toneIcons[toast.tone];

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.98 }}
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-3 shadow-premium backdrop-blur-xl ${toneStyles[toast.tone]}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1 text-sm font-medium leading-5">{toast.message}</p>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function App() {
  const {
    animatedNodes,
    animatedEdges,
    selectedNode,
    name,
    status,
    workflowSummary,
    onNodesChange,
    onEdgesChange,
    setSelectedNodeId,
    setName,
    setStatus,
    setWorkflowId,
    onConnect,
    addNode,
    updateNode,
    deleteSelectedNode,
    saveWorkflow,
    loadWorkflow,
    exportJson,
    clearCanvas,
    startNewWorkflow,
    setEdges,
    setNodes,
    executeWorkflow,
    deleteWorkflow,
    renameWorkflow,
    duplicateWorkflow,
    replayExecutionAnimation,
    executionResult,
    isExecuting,
    errorMessage,
    workflowId,
    savedWorkflows,
    executionContext,
    approveCurrent,
    rejectCurrent,
    resetExecutionState,
  } = useWorkflow();

  const { theme, toggleTheme } = useTheme();
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef<{ x: number; sidebarWidth: number; canvasWidth: number; inspectorWidth: number } | null>(null);
  const lastStatusRef = useRef(status);
  const [panelWidths, setPanelWidths] = useState(getStoredPanelWidths);
  const [activeSplitter, setActiveSplitter] = useState<'left' | 'right' | null>(null);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1024 : false));
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true));
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isExecutionDialogOpen, setIsExecutionDialogOpen] = useState(false);
  const [unsupportedNodeTypes, setUnsupportedNodeTypes] = useState<string[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const visibleWorkflowTemplates = useMemo(() => workflowTemplates.filter((template) => !containsHiddenUiNode(template.nodes)), []);
  const executionEligibility = getExecutionEligibility(animatedNodes);

  const pushToast = useCallback((message: string, tone: ToastTone = getToastTone(message)) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((currentToasts) => [...currentToasts.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
    }, 3600);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      const nextIsMobile = window.innerWidth < 1024;
      setIsMobile(nextIsMobile);
      setIsSidebarOpen((current) => (nextIsMobile ? current : true));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(panelWidths));
  }, [panelWidths]);

  useEffect(() => {
    if (status !== lastStatusRef.current) {
      lastStatusRef.current = status;
      pushToast(status);
    }
  }, [pushToast, status]);

  useEffect(() => {
    if (errorMessage) {
      pushToast(errorMessage, 'error');
    }
  }, [errorMessage, pushToast]);

  useEffect(() => {
    if (!activeSplitter) {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      return;
    }

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (event: MouseEvent) => {
      const origin = dragOrigin.current;
      if (!origin || !layoutRef.current) {
        return;
      }

      const containerWidth = layoutRef.current.getBoundingClientRect().width;
      const delta = event.clientX - origin.x;
      const splitterWidth = 8;
      const gapWidth = 16;
      const availableWidth = containerWidth - splitterWidth * 2 - gapWidth * 2;
      const minSidebar = 240;
      const minCanvas = 520;
      const minInspector = 340;

      if (activeSplitter === 'left') {
        const maxSidebar = availableWidth - minCanvas - origin.inspectorWidth;
        const nextSidebarWidth = clamp(origin.sidebarWidth + delta, minSidebar, maxSidebar);
        const nextCanvasWidth = availableWidth - nextSidebarWidth - origin.inspectorWidth;
        setPanelWidths((current) => ({
          ...current,
          sidebarWidth: nextSidebarWidth,
          canvasWidth: clamp(nextCanvasWidth, minCanvas, availableWidth - minSidebar - origin.inspectorWidth),
        }));
      }

      if (activeSplitter === 'right') {
        const maxCanvas = availableWidth - origin.sidebarWidth - minInspector;
        const nextCanvasWidth = clamp(origin.canvasWidth + delta, minCanvas, maxCanvas);
        const nextInspectorWidth = availableWidth - origin.sidebarWidth - nextCanvasWidth;
        setPanelWidths((current) => ({
          ...current,
          canvasWidth: nextCanvasWidth,
          inspectorWidth: clamp(nextInspectorWidth, minInspector, availableWidth - origin.sidebarWidth - minCanvas),
        }));
      }
    };

    const handleMouseUp = () => {
      setActiveSplitter(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeSplitter]);

  const handleSplitterMouseDown = (splitter: 'left' | 'right') => (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isMobile) {
      return;
    }

    dragOrigin.current = {
      x: event.clientX,
      sidebarWidth: panelWidths.sidebarWidth,
      canvasWidth: panelWidths.canvasWidth,
      inspectorWidth: panelWidths.inspectorWidth,
    };
    setActiveSplitter(splitter);
    event.preventDefault();
  };

  const handleSelectTemplate = (template: (typeof workflowTemplates)[number]) => {
    resetExecutionState();
    setName(template.initialName ?? template.name);
    setWorkflowId(null);
    setNodes(template.nodes);
    setEdges(template.edges);
    setSelectedNodeId(null);
    setStatus(`Loaded template: ${template.name}`);
    setIsTemplateModalOpen(false);
  };

  const handleDeleteRequest = (workflowId: string) => {
    const workflowName = savedWorkflows.find((workflow) => workflow.id === workflowId)?.name || 'workflow';
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete '${workflowName}'? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    const deleted = deleteWorkflow(workflowId);
    if (deleted) {
      pushToast('Workflow deleted successfully.', 'success');
    } else {
      pushToast('Unable to delete workflow.', 'error');
    }
  };

  const handleExecuteWorkflow = () => {
    const { canExecute, unsupportedNodeTypes: unavailableNodes } = getExecutionEligibility(animatedNodes);
    setUnsupportedNodeTypes(unavailableNodes);

    if (!canExecute) {
      setIsExecutionDialogOpen(true);
      pushToast('Workflow execution is blocked by unsupported node support.', 'warning');
      return;
    }

    executeWorkflow();
  };

  const stats = [
    { label: 'Nodes', value: workflowSummary.nodes, icon: Workflow, tone: 'text-blue-600 dark:text-cyan-300' },
    { label: 'Edges', value: workflowSummary.edges, icon: GitBranch, tone: 'text-violet-600 dark:text-violet-300' },
    { label: 'Updated', value: workflowSummary.lastUpdated, icon: Clock3, tone: 'text-emerald-600 dark:text-emerald-300' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 transition-colors duration-300 dark:bg-[#0B1220] dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 p-3 sm:p-4 lg:p-5">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-3 z-40 rounded-3xl border border-white/70 bg-white/78 px-4 py-3 shadow-premium backdrop-blur-2xl transition-colors dark:border-slate-800/80 dark:bg-[#111827]/78 sm:px-5"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 text-white shadow-lg shadow-cyan-500/20">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold text-slate-950 dark:text-white sm:text-2xl">SentinelMesh Studio</h1>
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200">
                    <Sparkles className="h-3 w-3" />
                    AI Workflow Platform
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{name || 'Untitled Workflow'}</p>
              </div>
            </div>

            <Toolbar
              onSave={saveWorkflow}
              onLoad={loadWorkflow}
              onExport={exportJson}
              onClear={clearCanvas}
              onExecute={handleExecuteWorkflow}
              onOpenTemplates={() => setIsTemplateModalOpen(true)}
              onNewWorkflow={startNewWorkflow}
              theme={theme}
              onToggleTheme={toggleTheme}
              onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
              isSidebarOpen={isSidebarOpen}
              isMobile={isMobile}
            />
          </div>
        </motion.header>

        <div ref={layoutRef} className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <AnimatePresence initial={false}>
            {(!isMobile || isSidebarOpen) ? (
              <motion.div
                key="sidebar"
                initial={isMobile ? { opacity: 0, height: 0 } : false}
                animate={isMobile ? { opacity: 1, height: 'auto' } : { opacity: 1 }}
                exit={isMobile ? { opacity: 0, height: 0 } : { opacity: 0 }}
                className="shrink-0 overflow-hidden"
                style={{ width: isMobile ? '100%' : `${panelWidths.sidebarWidth}px` }}
              >
                <Sidebar onAddNode={addNode} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {!isMobile ? (
            <div
              className="hidden w-2 shrink-0 cursor-col-resize rounded-full bg-slate-200 transition hover:bg-blue-400 lg:block dark:bg-slate-800 dark:hover:bg-cyan-400/70"
              onMouseDown={handleSplitterMouseDown('left')}
              role="separator"
              aria-orientation="vertical"
            />
          ) : null}

          <main
            className="min-h-0 rounded-3xl border border-slate-200/70 bg-white/78 p-3 shadow-premium backdrop-blur-2xl transition-colors dark:border-slate-800/80 dark:bg-[#111827]/78 sm:p-4"
            style={{ width: isMobile ? '100%' : `${panelWidths.canvasWidth}px`, minWidth: isMobile ? undefined : '520px', flexShrink: 0 }}
          >
            <div className="mb-3 flex flex-col gap-3">
              <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200">
                    <LayoutDashboard className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-950 dark:text-white">Workflow Canvas</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Design, connect, and execute automations</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="min-w-[14rem] flex-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 sm:flex-none">
                    Workflow name
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-100 dark:focus:border-cyan-400"
                    />
                  </label>
                  <div className="min-w-[13rem] flex-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 sm:flex-none">
                    <span className="block text-[11px] uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Saved workflows</span>
                    <WorkflowSelector
                      workflows={savedWorkflows}
                      activeWorkflowId={workflowId}
                      currentWorkflowId={workflowId}
                      currentWorkflowName={name}
                      onLoad={(selectedWorkflowId) => {
                        void loadWorkflow(selectedWorkflowId);
                      }}
                      onRename={renameWorkflow}
                      onDeleteRequest={handleDeleteRequest}
                      onDuplicate={duplicateWorkflow}
                      onCreateNew={startNewWorkflow}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${executionEligibility.canExecute ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200'}`}>
                    <Zap className="h-3.5 w-3.5" />
                    {executionEligibility.canExecute ? 'Backend supported' : 'Node support required'}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200">
                    <Activity className="h-3.5 w-3.5" />
                    {status}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => replayExecutionAnimation(executionResult?.execution_log)}
                  disabled={!executionResult?.execution_log?.length}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-400/50 dark:hover:bg-cyan-400/10"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Replay
                </button>
              </div>
            </div>

            <div className="h-[calc(100vh-16.5rem)] min-h-[620px] overflow-hidden rounded-2xl">
              <WorkflowCanvas
                nodes={animatedNodes}
                edges={animatedEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                onPaneClick={() => setSelectedNodeId(null)}
                onNodesDelete={(deleted) => {
                  const ids = new Set(deleted.map((node) => node.id));
                  setEdges((currentEdges) => currentEdges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)));
                }}
                onDropNode={addNode}
              />
            </div>
          </main>

          {!isMobile ? (
            <div
              className="hidden w-2 shrink-0 cursor-col-resize rounded-full bg-slate-200 transition hover:bg-blue-400 lg:block dark:bg-slate-800 dark:hover:bg-cyan-400/70"
              onMouseDown={handleSplitterMouseDown('right')}
              role="separator"
              aria-orientation="vertical"
            />
          ) : null}

          <aside className="w-full shrink-0 lg:w-auto" style={{ width: isMobile ? '100%' : `${panelWidths.inspectorWidth}px`, minWidth: isMobile ? undefined : '340px' }}>
            <div className="flex h-full max-h-none flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white/78 shadow-premium backdrop-blur-2xl transition-colors dark:border-slate-800/80 dark:bg-[#111827]/78 lg:max-h-[calc(100vh-7rem)]">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <section className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-blue-600 dark:text-cyan-300">Workflow Details</p>
                      <h3 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Live Statistics</h3>
                    </div>
                    {selectedNode ? (
                      <button
                        type="button"
                        onClick={deleteSelectedNode}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                      >
                        <PanelLeftClose className="h-4 w-4" />
                        Delete
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-2">
                    {stats.map((item) => {
                      const Icon = item.icon;

                      return (
                        <motion.div
                          key={item.label}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
                        >
                          <span className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                            <Icon className={`h-4 w-4 ${item.tone}`} />
                            {item.label}
                          </span>
                          <strong className="text-sm font-semibold text-slate-950 dark:text-slate-100">{item.value}</strong>
                        </motion.div>
                      );
                    })}
                  </div>
                </section>

                <PropertiesPanel selectedNode={selectedNode} onUpdateNode={updateNode} />
                <ExecutionPanel
                  result={executionResult}
                  isExecuting={isExecuting}
                  errorMessage={errorMessage}
                  nodes={animatedNodes}
                  executeWorkflow={executeWorkflow}
                  onApprove={async (approver?: string, reason?: string) => {
                    try {
                      await approveCurrent?.(approver, reason);
                    } catch (e) {
                      // ignore
                    }
                  }}
                  onReject={async (rejectedBy?: string, reason?: string) => {
                    try {
                      await rejectCurrent?.(rejectedBy, reason);
                    } catch (e) {
                      // ignore
                    }
                  }}
                  executionContext={executionContext}
                />
              </div>
            </div>
          </aside>
        </div>
      </div>

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id))} />

      <TemplateGalleryModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        onSelectTemplate={handleSelectTemplate}
        templates={visibleWorkflowTemplates}
      />
      <TemplateExecutionDialog
        isOpen={isExecutionDialogOpen}
        onClose={() => setIsExecutionDialogOpen(false)}
        unsupportedNodeTypes={unsupportedNodeTypes}
      />
    </div>
  );
}

export default App;
