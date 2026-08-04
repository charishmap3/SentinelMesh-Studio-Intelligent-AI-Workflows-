import { useMemo, useState, type ComponentType, type DragEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  BrainCircuit,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  Code2,
  Database,
  FileText,
  GitBranch,
  Mail,
  Network,
  Plug,
  Repeat2,
  Route,
  Search,
  Send,
  Shield,
  Sparkles,
  Split,
  Star,
  Table2,
  Upload,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import NodeLibraryCategory, { type NodeLibraryNode } from './NodeLibraryCategory';

type SidebarProps = {
  onAddNode: (type: string) => void;
};

type CategoryDefinition = {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  nodes: NodeLibraryNode[];
};

type CatalogNode = NodeLibraryNode & {
  categoryId: string;
  categoryTitle: string;
};

const categories: CategoryDefinition[] = [
  {
    id: 'triggers',
    title: 'Triggers',
    icon: Activity,
    nodes: [
      {
        id: 'email-trigger',
        label: 'Email Trigger',
        description: 'Start workflows from inbound Gmail messages.',
        icon: Mail,
        accent: 'from-blue-500 to-cyan-500',
      },
      {
        id: 'scheduler',
        label: 'Scheduler',
        description: 'Run workflows on a recurring schedule.',
        icon: CalendarClock,
        accent: 'from-violet-500 to-indigo-500',
      },
      {
        id: 'webhook',
        label: 'Webhook',
        description: 'Accept payloads from external systems.',
        icon: Plug,
        accent: 'from-cyan-500 to-sky-500',
      },
      {
        id: 'file-upload',
        label: 'File Upload',
        description: 'Collect documents or media that arrive through a form.',
        icon: Upload,
        accent: 'from-emerald-500 to-teal-500',
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI',
    icon: BrainCircuit,
    nodes: [
      { id: 'llm', label: 'LLM', description: 'Generate or reason with a configured model.', icon: Sparkles, accent: 'from-cyan-500 to-violet-500' },
      { id: 'extractor', label: 'Extractor', description: 'Extract structured fields from content.', icon: Table2, accent: 'from-indigo-500 to-blue-500' },
      { id: 'classifier', label: 'Classifier', description: 'Classify content into configured categories.', icon: Bot, accent: 'from-purple-500 to-fuchsia-500' },
      { id: 'summarizer', label: 'Summarizer', description: 'Condense long content into useful summaries.', icon: Code2, accent: 'from-teal-500 to-emerald-500' },
    ],
  },
  {
    id: 'logic',
    title: 'Logic',
    icon: GitBranch,
    nodes: [
      { id: 'condition', label: 'Condition', description: 'Branch on a boolean rule.', icon: Split, accent: 'from-emerald-500 to-lime-500' },
      { id: 'router', label: 'Router', description: 'Route work across named paths.', icon: Route, accent: 'from-amber-500 to-orange-500' },
      { id: 'loop', label: 'Loop', description: 'Repeat a set of steps until a stop condition is met.', icon: Repeat2, accent: 'from-amber-500 to-yellow-500' },
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    icon: Network,
    nodes: [
      { id: 'send-email', label: 'Send Email', description: 'Send an SMTP email from workflow output.', icon: Send, accent: 'from-sky-500 to-blue-600' },
      { id: 'calendar', label: 'Calendar', description: 'Create or update calendar events.', icon: CalendarClock, accent: 'from-violet-500 to-indigo-600' },
      { id: 'http-api', label: 'HTTP API', description: 'Call external services and APIs.', icon: Code2, accent: 'from-cyan-500 to-blue-600' },
      { id: 'database', label: 'Database', description: 'Read or write structured data.', icon: Database, accent: 'from-emerald-500 to-teal-600' },
    ],
  },
  {
    id: 'human',
    title: 'Human',
    icon: UserCheck,
    nodes: [
      { id: 'approval', label: 'Approval', description: 'Require a human reviewer before moving forward.', icon: UserCheck, accent: 'from-fuchsia-500 to-pink-600' },
    ],
  },
  {
    id: 'monitoring',
    title: 'Monitoring',
    icon: Activity,
    nodes: [
      {
        id: 'rag-incident-memory',
        label: 'RAG Incident Memory',
        description: 'Recall prior incidents and resolution context.',
        icon: BrainCircuit,
        accent: 'from-rose-500 to-violet-600',
      },
      { id: 'supervisor', label: 'Supervisor', description: 'Coordinate high-value oversight steps.', icon: Shield, accent: 'from-slate-600 to-zinc-700' },
      { id: 'failure-detection', label: 'Failure Detection', description: 'Surface signal-based failures proactively.', icon: AlertTriangle, accent: 'from-amber-500 to-orange-600' },
      { id: 'auto-healing', label: 'Auto Healing', description: 'Recover from issues with guided remediation.', icon: Activity, accent: 'from-emerald-500 to-green-600' },
    ],
  },
  {
    id: 'procurement',
    title: 'Procurement',
    icon: Wallet,
    nodes: [
      { id: 'requirement-validation', label: 'Requirement Validation', description: 'Validate procurement requirements before execution.', icon: ClipboardCheck, accent: 'from-cyan-500 to-sky-600' },
      { id: 'inventory', label: 'Inventory', description: 'Check stock and material availability.', icon: Database, accent: 'from-violet-500 to-indigo-600' },
      { id: 'vendor-selection', label: 'Vendor Selection', description: 'Compare and choose preferred suppliers.', icon: Users, accent: 'from-amber-500 to-orange-600' },
      { id: 'budget-validation', label: 'Budget Validation', description: 'Verify spend limits and funding availability.', icon: Wallet, accent: 'from-emerald-500 to-green-600' },
      { id: 'purchase-order', label: 'Purchase Order', description: 'Create purchase orders for approved requests.', icon: FileText, accent: 'from-rose-500 to-red-600' },
    ],
  },
];

function Sidebar({ onAddNode }: SidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    triggers: true,
    ai: true,
    logic: true,
    integrations: true,
    human: true,
    monitoring: true,
    procurement: true,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentlyUsed, setRecentlyUsed] = useState<string[]>([]);

  const totalNodes = useMemo(() => categories.reduce((count, category) => count + category.nodes.length, 0), []);

  const allNodes = useMemo<CatalogNode[]>(() => categories.flatMap((category) => category.nodes.map((node) => ({ ...node, categoryId: category.id, categoryTitle: category.title }))), []);

  const categorizedNodes = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return categories
      .map((category) => ({
        ...category,
        nodes: category.nodes.filter((node) => {
          if (!normalizedQuery) {
            return true;
          }

          return [node.label, node.description, category.title].some((value) => value.toLowerCase().includes(normalizedQuery));
        }),
      }))
      .filter((category) => category.nodes.length > 0);
  }, [searchQuery]);

  const favoriteNodes = useMemo(() => allNodes.filter((node) => favorites.includes(node.id)), [allNodes, favorites]);
  const recentNodes = useMemo(() => recentlyUsed.map((id) => allNodes.find((node) => node.id === id)).filter((node): node is CatalogNode => Boolean(node)), [allNodes, recentlyUsed]);

  const handleToggle = (categoryId: string) => {
    setExpandedCategories((current) => ({ ...current, [categoryId]: !current[categoryId] }));
  };

  const handleAddNode = (type: string) => {
    onAddNode(type);
    setRecentlyUsed((current) => [type, ...current.filter((id) => id !== type)].slice(0, 6));
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, type: string) => {
    event.dataTransfer.setData('application/reactflow', type);
    event.dataTransfer.effectAllowed = 'copy';
    setRecentlyUsed((current) => [type, ...current.filter((id) => id !== type)].slice(0, 6));
  };

  const handleToggleFavorite = (type: string) => {
    setFavorites((current) => (current.includes(type) ? current.filter((id) => id !== type) : [...current, type]));
  };

  return (
    <aside className="h-full w-full shrink-0 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/78 shadow-premium backdrop-blur-2xl transition-colors dark:border-slate-800/80 dark:bg-[#111827]/78">
      <div className="border-b border-slate-200/70 px-4 py-4 dark:border-slate-800/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-blue-600 dark:text-cyan-300">Node Library</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">Build Blocks</h2>
          </div>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200">
            {totalNodes}
          </span>
        </div>
      </div>

      <div className="max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto p-3">
        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
          <Search className="h-4 w-4" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search nodes"
            className="w-full bg-transparent outline-none placeholder:text-slate-400"
          />
        </label>

        {favoriteNodes.length > 0 ? (
          <section className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-2.5 dark:border-amber-400/20 dark:bg-amber-400/10">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-200">
              <Star className="h-3.5 w-3.5 fill-current" />
              Favorites
            </div>
            <div className="space-y-2">
              {favoriteNodes.map((node) => {
                const NodeIcon = node.icon;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => handleAddNode(node.id)}
                    className="flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-white/90 px-2.5 py-2 text-left text-sm text-slate-700 shadow-sm transition hover:border-amber-400 hover:bg-white dark:border-amber-400/20 dark:bg-slate-900/70 dark:text-slate-200"
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${node.accent} text-white`}>
                      <NodeIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{node.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {recentNodes.length > 0 ? (
          <section className="rounded-2xl border border-slate-200/70 bg-white/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              <Clock3 className="h-3.5 w-3.5" />
              Recently Used
            </div>
            <div className="space-y-2">
              {recentNodes.map((node) => {
                const NodeIcon = node.icon;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => handleAddNode(node.id)}
                    className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-left text-sm text-slate-700 transition hover:border-blue-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200"
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${node.accent} text-white`}>
                      <NodeIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{node.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {categorizedNodes.map((category) => (
          <NodeLibraryCategory
            key={category.id}
            title={category.title}
            icon={category.icon}
            nodes={category.nodes}
            isExpanded={expandedCategories[category.id] ?? true}
            onToggle={() => handleToggle(category.id)}
            onAddNode={handleAddNode}
            onDragStart={handleDragStart}
            isFavorite={favorites.includes.bind(favorites)}
            onToggleFavorite={handleToggleFavorite}
          />
        ))}
      </div>
    </aside>
  );
}

export default Sidebar;
