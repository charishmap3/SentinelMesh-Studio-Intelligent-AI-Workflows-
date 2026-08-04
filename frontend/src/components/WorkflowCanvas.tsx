import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeMouseHandler,
  type OnNodesDelete,
  type ReactFlowProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import WorkflowNode from './WorkflowNode';
import { normalizeNodeKind } from '../nodeCapabilities';
import type { WorkflowEdge, WorkflowNode as WorkflowNodeType } from '../types/workflow';

type WorkflowCanvasProps = {
  nodes: WorkflowNodeType[];
  edges: WorkflowEdge[];
  onNodesChange: ReactFlowProps['onNodesChange'];
  onEdgesChange: ReactFlowProps['onEdgesChange'];
  onConnect: ReactFlowProps['onConnect'];
  onNodeClick: NodeMouseHandler;
  onPaneClick: ReactFlowProps['onPaneClick'];
  onNodesDelete: OnNodesDelete;
  onDropNode: (kind: string, position: { x: number; y: number }) => void;
};

const nodeTypes = {
  workflowNode: WorkflowNode,
};

const minimapColors: Record<string, string> = {
  'email-trigger': '#0891b2',
  scheduler: '#7c3aed',
  webhook: '#06b6d4',
  'file-upload': '#10b981',
  llm: '#8b5cf6',
  extractor: '#2563eb',
  classifier: '#c026d3',
  summarizer: '#0d9488',
  condition: '#16a34a',
  router: '#f59e0b',
  loop: '#f97316',
  'send-email': '#0284c7',
  calendar: '#7c3aed',
  'http-api': '#0891b2',
  database: '#059669',
  approval: '#ec4899',
  supervisor: '#475569',
  'failure-detection': '#f97316',
  'auto-healing': '#22c55e',
  'requirement-validation': '#0ea5e9',
  inventory: '#2563eb',
  'vendor-selection': '#c2410c',
  'budget-validation': '#16a34a',
  'purchase-order': '#be123c',
  'rag-incident-memory': '#e11d48',
};

function getMiniMapNodeColor(node: WorkflowNodeType) {
  return minimapColors[normalizeNodeKind(node.data.kind)] ?? '#64748b';
}

function WorkflowCanvasContent({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onPaneClick,
  onNodesDelete,
  onDropNode,
}: WorkflowCanvasProps) {
  const { project } = useReactFlow();

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/reactflow');
    if (!kind) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const position = project({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    onDropNode(kind, position);
  };

  return (
    <div
      className="h-full w-full overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-inner transition-colors dark:border-slate-800/80 dark:bg-[#0B1220]"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodesDelete={onNodesDelete}
        deleteKeyCode={['Delete', 'Backspace']}
        fitView
        fitViewOptions={{ padding: 0.18, duration: 450 }}
        snapToGrid
        snapGrid={[16, 16]}
        connectionLineStyle={{ stroke: 'var(--edge-active)', strokeWidth: 2.5 }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--edge-default)' },
          style: { stroke: 'var(--edge-default)', strokeWidth: 2.25 },
        }}
        attributionPosition="bottom-left"
        style={{ width: '100%', height: '100%' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="var(--canvas-dot)" />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap
          position="bottom-left"
          nodeColor={getMiniMapNodeColor}
          nodeStrokeWidth={3}
          maskColor="rgba(15, 23, 42, 0.12)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasContent {...props} />
    </ReactFlowProvider>
  );
}

export default WorkflowCanvas;
