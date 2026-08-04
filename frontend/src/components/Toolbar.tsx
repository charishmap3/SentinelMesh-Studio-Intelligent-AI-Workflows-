import {
  Download,
  FolderOpen,
  LayoutTemplate,
  Moon,
  PanelLeftOpen,
  Play,
  Plus,
  Save,
  Sun,
  Trash2,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { ThemeMode } from '../hooks/useTheme';

type ToolbarProps = {
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onClear: () => void;
  onExecute: () => void;
  onOpenTemplates: () => void;
  onNewWorkflow: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  isMobile: boolean;
};

type ToolbarButtonProps = {
  label: string;
  title?: string;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  compact?: boolean;
};

function ToolbarButton({ label, title, onClick, icon: Icon, variant = 'secondary', compact = false }: ToolbarButtonProps) {
  const variantClass = {
    primary:
      'border-transparent bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-violet-400',
    secondary:
      'border-slate-200/80 bg-white/80 text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-cyan-400/60 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-100',
    ghost:
      'border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
    danger:
      'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20',
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 active:translate-y-0 ${variantClass} ${
        compact ? 'w-10 px-0 sm:w-auto sm:px-3' : ''
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className={compact ? 'hidden sm:inline' : ''}>{label}</span>
    </button>
  );
}

function Toolbar({
  onSave,
  onLoad,
  onExport,
  onClear,
  onExecute,
  onOpenTemplates,
  onNewWorkflow,
  theme,
  onToggleTheme,
  onToggleSidebar,
  isSidebarOpen,
  isMobile,
}: ToolbarProps) {
  return (
    <div className="flex w-full flex-wrap items-center justify-start gap-2 lg:w-auto lg:justify-end">
      {isMobile ? (
        <ToolbarButton
          label={isSidebarOpen ? 'Hide Library' : 'Node Library'}
          title="Toggle node library"
          onClick={onToggleSidebar}
          icon={PanelLeftOpen}
          variant="ghost"
          compact
        />
      ) : null}

      <ToolbarButton label="New Workflow" onClick={onNewWorkflow} icon={Plus} variant="ghost" compact />
      <ToolbarButton label="Templates" onClick={onOpenTemplates} icon={LayoutTemplate} compact />
      <ToolbarButton label="Save Workflow" onClick={onSave} icon={Save} compact />
      <ToolbarButton label="Load Workflow" onClick={onLoad} icon={FolderOpen} compact />
      <ToolbarButton label="Export JSON" onClick={onExport} icon={Download} compact />
      <ToolbarButton label="Execute Workflow" onClick={onExecute} icon={Play} variant="primary" />
      <ToolbarButton label="Reset Canvas" onClick={onClear} icon={Trash2} variant="danger" compact />

      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        className="relative inline-flex h-10 w-[4.5rem] items-center rounded-full border border-slate-200/80 bg-white/80 p-1 text-slate-700 shadow-sm transition duration-300 hover:border-blue-300 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:border-cyan-400/60"
      >
        <span
          className={`absolute h-8 w-8 rounded-full bg-gradient-to-br shadow-lg transition-transform duration-300 ${
            theme === 'dark'
              ? 'translate-x-8 from-cyan-400 to-violet-500 shadow-cyan-500/20'
              : 'translate-x-0 from-blue-500 to-cyan-400 shadow-blue-500/20'
          }`}
        />
        <Sun className={`relative z-10 h-4 w-4 transition ${theme === 'light' ? 'text-white' : 'text-slate-400'}`} />
        <Moon className={`relative z-10 ml-auto h-4 w-4 transition ${theme === 'dark' ? 'text-white' : 'text-slate-400'}`} />
      </button>

    </div>
  );
}

export default Toolbar;
