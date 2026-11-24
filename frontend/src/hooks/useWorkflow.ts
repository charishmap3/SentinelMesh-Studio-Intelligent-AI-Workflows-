import { useEffect, useMemo, useRef, useState } from 'react';
import { type Connection, addEdge, useEdgesState, useNodesState } from 'reactflow';
import { executeWorkflow, listWorkflows, saveWorkflow, updateWorkflow, approveWorkflow, rejectWorkflow } from '../services/api';
import { deleteWorkflowFromStorage, duplicateWorkflowInStorage, listWorkflowsFromStorage, loadWorkflowFromStorage, renameWorkflowInStorage, saveWorkflowToStorage, exportWorkflowJson, normalizeWorkflowEdges } from '../services/workflowStorage';
import { getNodeExecutionState, getVisualExecutionState } from './executionState';
import type { SavedWorkflow, WorkflowEdge, WorkflowExecutionResult, WorkflowNode, WorkflowNodeData, WorkflowNodeField, WorkflowNodeValue, WorkflowPayload } from '../types/workflow';
import { normalizeClassifierCategory } from '../utils/classifierHandles';
import { toStructuredLogs } from '../utils/structuredLogs';

const initialNodes: WorkflowNode[] = [
  {
    id: 'requirement-validation-1',
    type: 'workflowNode',
    position: { x: 80, y: 80 },
    data: {
      label: 'Requirement Validation',
      nodeType: 'Requirement Validation',
      description: 'Validate incoming requirements before proceeding.',
      config: 'Rule: must include business owner',
      kind: 'requirement-validation',
    },
  },
  {
    id: 'approval-1',
    type: 'workflowNode',
    position: { x: 360, y: 220 },
    data: {
      label: 'Approval',
      nodeType: 'Approval',
      description: 'Review and authorize the request.',
      config: 'Approver: Finance Lead',
      kind: 'approval',
    },
  },
];

const initialEdges: WorkflowEdge[] = [{ id: 'e1', source: 'requirement-validation-1', target: 'approval-1' }];

type ExecutionAnimationState = {
  currentNodeId: string | null;
  completedNodeIds: string[];
  failedNodeIds: string[];
  activeEdgeIds: string[];
  isPlaying: boolean;
  skippedNodeIds: string[];
};

const emptyExecutionContext = () => ({
  currentNode: null as string | null,
  paused: false,
  waitingApproval: false,
  completedNodes: [] as string[],
  pendingNodes: [] as string[],
  failedNodes: [] as string[],
  timeline: [] as Array<{ nodeId: string; label?: string; start?: string | null; end?: string | null; duration?: number | null; status?: string }>,
  executionLogs: [] as Array<any>,
  supervisorMetrics: {} as Record<string, any>,
  approvalState: null as null | Record<string, any>,
  executionMetrics: {} as Record<string, any>,
});

export function useWorkflow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [name, setName] = useState('Procurement Workflow');
  const [status, setStatus] = useState('Ready');
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([]);
  const [executionResult, setExecutionResult] = useState<WorkflowExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [executionAnimation, setExecutionAnimation] = useState<ExecutionAnimationState | null>(null);
  const replayTimeoutRef = useRef<number | null>(null);

  // NEW: execution context maintains live monitoring state, structured logs, supervisor metrics, approval state
  const [executionContext, setExecutionContext] = useState(emptyExecutionContext);

  const workflowSummary = useMemo(() => ({
    nodes: nodes.length,
    edges: edges.length,
    lastUpdated: new Date().toLocaleTimeString(),
  }), [nodes.length, edges.length]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;

  const animatedNodes = useMemo(() => {
    return nodes.map((node) => {
      const state: WorkflowNodeData['executionState'] = getVisualExecutionState(node.id, {
        currentNodeId: executionAnimation?.currentNodeId ?? null,
        completedNodeIds: executionAnimation?.completedNodeIds ?? [],
        failedNodeIds: executionAnimation?.failedNodeIds ?? [],
        skippedNodeIds: executionAnimation?.skippedNodeIds ?? [],
        isPlaying: executionAnimation?.isPlaying ?? false,
      });

      return {
        ...node,
        data: {
          ...node.data,
          executionState: state,
        },
      };
    });
  }, [nodes, executionAnimation]);

  const animatedEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      animated: executionAnimation?.activeEdgeIds.includes(edge.id) ?? false,
      style: executionAnimation?.activeEdgeIds.includes(edge.id)
        ? { stroke: 'var(--edge-active)', strokeWidth: 3 }
        : { stroke: 'var(--edge-default)', strokeWidth: 2 },
    }));
  }, [edges, executionAnimation]);

  const onConnect = (params: Connection) => {
    const sourceNode = nodes.find((node) => node.id === params.source);
    const sourceKind = sourceNode?.data?.kind;
    const normalizedKind = sourceKind ? sourceKind.toLowerCase() : '';

    const nextParams: Connection = { ...params };

    if (normalizedKind === 'classifier' && params.sourceHandle) {
      nextParams.sourceHandle = params.sourceHandle;
    } else if (normalizedKind === 'classifier' && !params.sourceHandle) {
      const fallbackHandle = sourceNode?.data?.categories
        ?.map((category) => normalizeClassifierCategory(category))
        .find(Boolean);
      if (fallbackHandle) {
        nextParams.sourceHandle = fallbackHandle;
      }
    }

    setEdges((currentEdges) => addEdge(nextParams, currentEdges));
  };

  const addNode = (kind: string) => {
    const id = `${kind}-${Date.now()}`;
    const label = kind
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

    const description = kind === 'email-trigger'
      ? 'Collect inbound emails from Gmail.'
      : kind === 'scheduler'
        ? 'Run this step on a repeating schedule.'
        : kind === 'webhook'
          ? 'Receive and process webhook payloads.'
          : kind === 'file-upload'
            ? 'Handle uploaded files supplied through a form.'
            : kind === 'llm'
              ? 'Generate text with an LLM provider.'
              : kind === 'condition'
                ? 'Evaluate a condition and branch on true/false.'
                : kind === 'router'
                  ? 'Select one outgoing route based on a field evaluation.'
                  : kind === 'loop'
                    ? 'Repeat a sequence until a stop condition is reached.'
                    : kind === 'approval'
                      ? 'Pause for explicit human approval.'
                      : kind === 'supervisor'
                        ? 'Coordinate an oversight or supervision step.'
                        : kind === 'failure-detection'
                          ? 'Detect workflow failures and route them for review.'
                          : kind === 'auto-healing'
                            ? 'Apply automated recovery for known issues.'
                            : kind === 'requirement-validation'
                              ? 'Validate the request before procurement continues.'
                              : kind === 'inventory'
                                ? 'Check current stock and availability.'
                                : kind === 'vendor-selection'
                                  ? 'Compare candidate vendors and choose the best fit.'
                                  : kind === 'budget-validation'
                                    ? 'Confirm spending remains within the available budget.'
                                    : kind === 'purchase-order'
                                      ? 'Create a purchase order for an approved request.'
                                      : 'New workflow step.';

    const config = kind === 'email-trigger'
      ? 'Email account, folder, and filter settings'
      : kind === 'scheduler'
        ? 'Cron expression or interval settings'
        : kind === 'webhook'
          ? 'Endpoint, secret, and payload mapping'
          : kind === 'file-upload'
            ? 'Upload source, file type, and storage settings'
            : kind === 'llm'
              ? 'LLM runtime configuration'
              : kind === 'condition'
                ? 'Field, operator, and value determine the branch.'
                : kind === 'router'
                  ? 'Routes are evaluated in order; first match wins.'
                  : kind === 'loop'
                    ? 'Collection field, iteration limit, and stop criteria'
                    : kind === 'approval'
                      ? 'Approver, timeout, and escalation policy'
                      : kind === 'supervisor'
                        ? 'Supervisor instructions and handoff policy'
                        : kind === 'failure-detection'
                          ? 'Failure detection rules and alert thresholds'
                          : kind === 'auto-healing'
                            ? 'Remediation steps and recovery policy'
                            : kind === 'requirement-validation'
                              ? 'Validation rules and evidence requirements'
                              : kind === 'inventory'
                                ? 'Inventory source and availability criteria'
                                : kind === 'vendor-selection'
                                  ? 'Scoring rules and approved supplier list'
                                  : kind === 'budget-validation'
                                    ? 'Budget thresholds and approval limits'
                                    : kind === 'purchase-order'
                                      ? 'Purchase order template and approval flow'
                                      : 'Default configuration';

    const nodeData: WorkflowNodeData = {
      label,
      nodeType: label,
      description,
      config,
      kind,
      ...(kind === 'scheduler' ? { scheduleType: 'interval', intervalMinutes: 1 } : {}),
      ...(kind === 'email-trigger'
        ? {
            emailAccount: 'you@example.com',
            folder: 'INBOX',
            unreadOnly: true,
            subjectFilter: '',
          }
        : {}),
      ...(kind === 'llm'
        ? {
            provider: 'OpenAI',
            model: 'gpt-4.1-mini',
            prompt: 'Summarize the incoming content.',
            temperature: 0.2,
            maxTokens: 256,
          }
        : {}),
      ...(kind === 'send-email'
        ? {
            recipientEmail: 'recipient@example.com',
            subject: 'SentinelMesh notification',
            body: 'This is a fallback email body.',
            useLlmOutput: true,
          }
        : {}),
      ...(kind === 'classifier'
        ? {
            provider: 'Groq',
            model: 'llama-3.1-8b-instant',
            inputField: 'email_subject_and_body',
            categories: ['critical', 'support', 'general'],
            instructions: 'Classify the incoming content into exactly one configured category.',
            temperature: 0,
            maxTokens: 128,
          }
        : {}),
      ...(kind === 'extractor'
        ? {
            provider: 'Groq',
            model: 'llama-3.1-8b-instant',
            inputField: 'email_subject_and_body',
            extractionFields: ['service', 'status', 'location', 'urgency'],
            instructions: 'Extract the requested fields into a structured JSON object.',
            temperature: 0,
            maxTokens: 256,
          }
        : {}),
      ...(kind === 'summarizer'
        ? {
            provider: 'Groq',
            model: 'llama-3.1-8b-instant',
            inputField: 'email_subject_and_body',
            instructions: 'Summarize the incoming content clearly and concisely. Preserve the important facts, issue, impact, and requested action. Do not invent information.',
            temperature: 0.2,
            maxTokens: 256,
          }
        : {}),
      ...(kind === 'condition'
        ? {
            field: 'email_subject',
            operator: 'contains',
            value: 'URGENT',
          }
        : kind === 'router'
        ? {
            field: 'workflow_status',
            defaultRoute: 'default',
            routes: [
              { route: 'critical', operator: 'equals', value: 'CRITICAL' },
              { route: 'normal', operator: 'equals', value: 'NORMAL' },
            ],
          }
        : {}),
    };

    const newNode: WorkflowNode = {
      id,
      type: 'workflowNode',
      position: { x: 120 + nodes.length * 40, y: 80 + nodes.length * 40 },
      data: nodeData,
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);
    setStatus(`Added ${label}`);
  };

  const updateNode = (id: string, field: WorkflowNodeField, value: WorkflowNodeValue) => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, [field]: value } } : node)),
    );
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) {
      return;
    }

    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== selectedNodeId));
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId(null);
    setStatus('Removed selected node');
  };

  const applyWorkflowState = (workflow: { id?: string | null; name: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] }, statusText: string) => {
    setWorkflowId(workflow.id ?? null);
    setName(workflow.name);
    setNodes(workflow.nodes);
    setEdges(workflow.edges);
    setSelectedNodeId(null);
    setStatus(statusText);
    setErrorMessage(null);
  };

  const resetExecutionState = () => {
    setExecutionResult(null);
    setExecutionAnimation(null);
    setExecutionContext(emptyExecutionContext());
    setErrorMessage(null);
  };

  const refreshSavedWorkflows = () => {
    setSavedWorkflows(listWorkflowsFromStorage());
  };

  useEffect(() => {
    refreshSavedWorkflows();
  }, []);

  const handleDeleteWorkflow = (workflowIdToDelete?: string | null) => {
    if (!workflowIdToDelete) {
      setStatus('No workflow selected for deletion');
      setErrorMessage('No workflow selected.');
      return false;
    }

    const deleted = deleteWorkflowFromStorage(workflowIdToDelete);
    if (!deleted) {
      setStatus('Unable to delete workflow');
      setErrorMessage('Workflow could not be found.');
      return false;
    }

    refreshSavedWorkflows();

    if (workflowIdToDelete === workflowId) {
      setWorkflowId(null);
      setName('Procurement Workflow');
      setNodes([]);
      setEdges([]);
      setSelectedNodeId(null);
      setExecutionResult(null);
      setStatus('Deleted active workflow and started a new workflow');
      setErrorMessage(null);
    } else {
      setStatus('Workflow deleted successfully');
      setErrorMessage(null);
    }

    return true;
  };

  const handleRenameWorkflow = (workflowIdToRename: string, newName: string) => {
    const renamed = renameWorkflowInStorage(workflowIdToRename, newName);
    if (!renamed) {
      setStatus('Unable to rename workflow');
      setErrorMessage('Workflow could not be found or name was invalid.');
      return false;
    }

    refreshSavedWorkflows();
    if (workflowIdToRename === workflowId) {
      setName(newName.trim());
    }

    setStatus('Workflow renamed successfully');
    setErrorMessage(null);
    return true;
  };

  const handleDuplicateWorkflow = (workflowIdToDuplicate: string) => {
    const duplicate = duplicateWorkflowInStorage(workflowIdToDuplicate);
    if (!duplicate) {
      setStatus('Unable to duplicate workflow');
      setErrorMessage('Workflow could not be duplicated.');
      return null;
    }

    refreshSavedWorkflows();
    setStatus('Workflow duplicated successfully');
    setErrorMessage(null);
    return duplicate;
  };

  const handleSaveWorkflow = async () => {
    const workflowName = name.trim() || 'Untitled Workflow';
    const normalizedEdges = normalizeWorkflowEdges(nodes, edges);
    const payload: WorkflowPayload = {
      name: workflowName,
      description: `Workflow built in SentinelMesh Studio: ${workflowName}`,
      nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
      edges: normalizedEdges,
    };

    try {
      let savedWorkflow: Awaited<ReturnType<typeof saveWorkflow>>;
      if (workflowId) {
        try {
          savedWorkflow = await updateWorkflow(workflowId, payload);
        } catch {
          savedWorkflow = await saveWorkflow(payload);
        }
      } else {
        savedWorkflow = await saveWorkflow(payload);
      }
      saveWorkflowToStorage(nodes, edges, { workflowId: savedWorkflow.workflow_id, name: workflowName, description: payload.description });
      setWorkflowId(savedWorkflow.workflow_id);
      setName(workflowName);
      refreshSavedWorkflows();
      setStatus(`Workflow saved to backend: ${savedWorkflow.workflow_id}`);
      setErrorMessage(null);
      return savedWorkflow.workflow_id;
    } catch (error) {
      setStatus('Save failed');
      const message = error instanceof Error ? error.message : 'Unable to save workflow.';
      setErrorMessage(message);
      throw new Error(message);
    }
  };

  const handleLoadWorkflow = async (workflowIdToLoad?: string | null) => {
    try {
      const stored = loadWorkflowFromStorage(workflowIdToLoad);
      if (!stored) {
        const workflows = await listWorkflows();
        if (!workflows.length) {
          setStatus('No saved workflow found');
          return;
        }

        const latest = workflows[workflows.length - 1];
        applyWorkflowState({
          id: latest.workflow_id,
          name: latest.name,
          nodes: latest.nodes as WorkflowNode[],
          edges: latest.edges,
        }, 'Workflow loaded from backend');
        refreshSavedWorkflows();
        return;
      }

      applyWorkflowState(stored, 'Workflow loaded locally');
      refreshSavedWorkflows();
    } catch (error) {
      setStatus('Load failed');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load workflow.');
    }
  };

  const exportJson = () => {
    exportWorkflowJson(name, nodes, edges);
    setStatus('JSON exported');
  };

  const replayExecutionAnimation = (result: WorkflowExecutionResult | string[] | null = executionResult) => {
    if (replayTimeoutRef.current !== null) {
      window.clearTimeout(replayTimeoutRef.current);
      replayTimeoutRef.current = null;
    }

    const nodeState = getNodeExecutionState(nodes, Array.isArray(result) ? ({ execution_log: result } as WorkflowExecutionResult) : result);

    setExecutionAnimation({
      currentNodeId: nodeState.currentNodeId,
      completedNodeIds: [],
      failedNodeIds: [],
      activeEdgeIds: [],
      isPlaying: true,
      skippedNodeIds: nodeState.skippedNodeIds,
    });

    replayTimeoutRef.current = window.setTimeout(() => {
      replayTimeoutRef.current = null;
      setExecutionAnimation({
        currentNodeId: null,
        completedNodeIds: nodeState.completedNodeIds,
        failedNodeIds: nodeState.failedNodeIds,
        activeEdgeIds: [],
        isPlaying: false,
        skippedNodeIds: nodeState.skippedNodeIds,
      });
    }, 500);
  };

  const executeWorkflowFromBackend = async () => {
    let currentWorkflowId = workflowId;

    try {
      currentWorkflowId = await handleSaveWorkflow();
    } catch {
      setStatus('Execution unavailable');
      return;
    }

    setIsExecuting(true);
    setErrorMessage(null);

    try {
      const result = await executeWorkflow(currentWorkflowId);
      // set raw result
      setExecutionResult(result);

      // build structured logs and execution context
      const structured = toStructuredLogs(result.execution_log);

      // compute basic lists
      const completed = Array.from(new Set((result.executed_node_ids ?? []).filter(Boolean)));
      const failed = Array.from(new Set((result.failed_node_ids ?? []).filter(Boolean)));
      const executedSet = new Set(completed.concat(failed));
      const pending = nodes.filter((n) => !executedSet.has(n.id)).map((n) => n.id);

      const current = result.current_node_id ?? null;
      const waitingApproval = Boolean(current && nodes.find((n) => n.id === current && n.data?.kind === 'approval'));

      // supervisor metrics: per node, capture start/end from logs and outputs
      const supervisorMetrics: Record<string, any> = {};
      nodes.forEach((n) => {
        const nodeLogs = structured.filter((l) => l.node && l.node.toLowerCase().includes((n.data.label ?? n.id).toLowerCase()));
        const start = nodeLogs.length ? nodeLogs[0].timestamp ?? null : null;
        const end = nodeLogs.length ? nodeLogs[nodeLogs.length - 1].timestamp ?? null : null;
        const duration = start && end ? Math.max(0, new Date(end).getTime() - new Date(start).getTime()) : null;
        const outputs = result.node_outputs?.find((o) => o.node_id === n.id)?.outputs ?? null;
        const status = failed.includes(n.id) ? 'failed' : completed.includes(n.id) ? 'success' : current === n.id ? 'current' : 'pending';
        supervisorMetrics[n.id] = { nodeId: n.id, label: n.data.label, start, end, duration, status, outputs, retries: 0 };
      });

      const timeline = nodes.map((n) => ({ nodeId: n.id, label: n.data.label, start: supervisorMetrics[n.id].start, end: supervisorMetrics[n.id].end, duration: supervisorMetrics[n.id].duration, status: supervisorMetrics[n.id].status }));

      setExecutionContext((cur) => ({
        ...cur,
        currentNode: current,
        paused: waitingApproval,
        waitingApproval,
        completedNodes: completed,
        pendingNodes: pending,
        failedNodes: failed,
        timeline,
        executionLogs: structured,
        supervisorMetrics,
        approvalState: waitingApproval ? { requestedAt: new Date().toISOString(), approver: null, reason: null } : cur.approvalState,
      }));

      setExecutionAnimation(null);
      replayExecutionAnimation(result);
      setStatus('Workflow executed');
    } catch (error) {
      setExecutionResult(null);
      setStatus('Execution failed');
      const message = error instanceof Error ? error.message : 'Workflow execution failed.';
      setErrorMessage(message);
      console.error(message);
    } finally {
      setIsExecuting(false);
    }
  };

  useEffect(() => {
    return () => {
      if (replayTimeoutRef.current !== null) {
        window.clearTimeout(replayTimeoutRef.current);
        replayTimeoutRef.current = null;
      }
    };
  }, []);

  // Approve / Reject handlers
  const approveCurrent = async (approver?: string, reason?: string) => {
    // mark approval in context and resume execution by calling backend
    setExecutionContext((cur) => ({
      ...cur,
      paused: false,
      waitingApproval: false,
      approvalState: {
        ...(cur.approvalState ?? {}),
        approvedBy: approver ?? 'User',
        approvalTime: new Date().toISOString(),
        approvalReason: reason ?? null,
      },
      executionLogs: [
        ...(cur.executionLogs ?? []),
        { timestamp: new Date().toISOString(), node: 'Approval', type: 'INFO', status: 'APPROVED', message: `Approved by ${approver ?? 'User'}` },
        { timestamp: new Date().toISOString(), node: 'Workflow', type: 'INFO', status: 'RESUMED', message: 'Workflow execution resumed' },
      ],
    }));

    // resume via backend approve API if available
    if (workflowId) {
      try {
        const res = await approveWorkflow(workflowId, { approver, reason });
        // integrate returned result
        setExecutionResult(res);
        const structured = toStructuredLogs(res.execution_log);
        setExecutionContext((cur) => ({ ...cur, executionLogs: structured }));
        // refresh animation
        replayExecutionAnimation(res);
      } catch (err) {
        console.error('Approve API failed', err);
        // fallback: call execute to refresh
        await executeWorkflowFromBackend();
      }
    } else {
      await executeWorkflowFromBackend();
    }
  };

  const rejectCurrent = async (rejectedBy?: string, reason?: string) => {
    // mark rejected and stop locally first
    setExecutionContext((cur) => ({
      ...cur,
      paused: false,
      waitingApproval: false,
      approvalState: {
        ...(cur.approvalState ?? {}),
        rejectedBy: rejectedBy ?? 'User',
        rejectionTime: new Date().toISOString(),
        rejectionReason: reason ?? null,
      },
      executionLogs: [
        ...(cur.executionLogs ?? []),
        { timestamp: new Date().toISOString(), node: 'Approval', type: 'ERROR', status: 'REJECTED', message: `Rejected by ${rejectedBy ?? 'User'}` },
        { timestamp: new Date().toISOString(), node: 'Workflow', type: 'ERROR', status: 'TERMINATED', message: 'Workflow execution terminated by rejection' },
      ],
      failedNodes: [...cur.failedNodes, cur.currentNode ?? 'approval'],
    }));

    // notify backend if supported
    if (workflowId) {
      try {
        const res = await rejectWorkflow(workflowId, { rejectedBy, reason });
        setExecutionResult(res);
        const structured = toStructuredLogs(res.execution_log);
        setExecutionContext((cur) => ({ ...cur, executionLogs: structured }));
      } catch (err) {
        console.error('Reject API failed', err);
        // no-op
      }
    } else {
      // reflect result locally as failed
      setExecutionResult((prev) => ({
        ...(prev ?? {}),
        execution_status: 'failed',
        current_node_id: prev?.current_node_id ?? null,
        failed_node_ids: Array.from(new Set([...(prev?.failed_node_ids ?? []), prev?.current_node_id ?? 'approval'])),
        execution_log: (prev?.execution_log ?? []).concat([
          `${new Date().toISOString()} - Approval: Rejected by ${rejectedBy ?? 'User'}`,
          `${new Date().toISOString()} - Workflow: Execution terminated by rejection`,
        ]),
      } as WorkflowExecutionResult));
    }
  };


  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setStatus('Canvas cleared');
  };

  const startNewWorkflow = () => {
    setWorkflowId(null);
    setName('Procurement Workflow');
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setExecutionResult(null);
    setStatus('Started a new workflow');
    setErrorMessage(null);
  };

  return {
    nodes,
    edges,
    animatedNodes,
    animatedEdges,
    selectedNode,
    selectedNodeId,
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
    saveWorkflow: handleSaveWorkflow,
    loadWorkflow: handleLoadWorkflow,
    exportJson,
    clearCanvas,
    startNewWorkflow,
    setNodes,
    setEdges,
    executeWorkflow: executeWorkflowFromBackend,
    replayExecutionAnimation,
    workflowId,
    savedWorkflows,
    deleteWorkflow: handleDeleteWorkflow,
    renameWorkflow: handleRenameWorkflow,
    duplicateWorkflow: handleDuplicateWorkflow,
    executionResult,
    isExecuting,
    errorMessage,
    executionContext,
    approveCurrent,
    rejectCurrent,
    resetExecutionState,
  };
}
