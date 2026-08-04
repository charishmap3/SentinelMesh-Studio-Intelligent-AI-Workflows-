import type { ComponentType, DragEvent } from 'react';
import { ChevronRight, GripVertical, Plus, Star } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export type NodeLibraryNode = {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
};

type NodeLibraryCategoryProps = {
  title: string;
  icon: ComponentType<{ className?: string }>;
  nodes: NodeLibraryNode[];
  isExpanded: boolean;
  onToggle: () => void;
  onAddNode: (type: string) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, type: string) => void;
  isFavorite?: (type: string) => boolean;
  onToggleFavorite?: (type: string) => void;
};

function NodeLibraryCategory({ title, icon: Icon, nodes, isExpanded, onToggle, onAddNode, onDragStart, isFavorite, onToggleFavorite }: NodeLibraryCategoryProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm transition-colors dark:border-slate-800/80 dark:bg-slate-950/45">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition hover:bg-slate-100/80 dark:hover:bg-slate-800/70"
        aria-expanded={isExpanded}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-cyan-300">
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-950 dark:text-slate-100">{title}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">{nodes.length} nodes</span>
          </span>
        </span>
        <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-slate-200/70 px-3 pb-3 pt-2 dark:border-slate-800/80">
              {nodes.map((node) => {
                const NodeIcon = node.icon;
                const favorite = isFavorite?.(node.id) ?? false;

                return (
                  <motion.div
                    key={node.id}
                    whileHover={{ y: -2, scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        draggable
                        type="button"
                        onClick={() => onAddNode(node.id)}
                        onDragStart={(event) => onDragStart(event, node.id)}
                        className="group flex min-w-0 flex-1 items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-white hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-cyan-400/50 dark:hover:bg-slate-900"
                      >
                        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${node.accent} text-white shadow-lg shadow-slate-900/10`}>
                          <NodeIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-slate-950 dark:text-slate-100">{node.label}</span>
                            <Plus className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100" />
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{node.description}</span>
                        </span>
                        <GripVertical className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-500 dark:text-slate-700 dark:group-hover:text-slate-500" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleFavorite?.(node.id);
                        }}
                        className="rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-400 transition hover:border-amber-300 hover:text-amber-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-500"
                        aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star className={`h-4 w-4 ${favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export default NodeLibraryCategory;
