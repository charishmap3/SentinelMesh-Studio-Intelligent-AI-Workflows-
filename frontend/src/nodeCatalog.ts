import { normalizeNodeKind } from './nodeCapabilities';
import type { WorkflowNode } from './types/workflow';

const hiddenUiNodeKindList = [] as const;

export const hiddenUiNodeKinds = new Set<string>(hiddenUiNodeKindList);

export function containsHiddenUiNode(nodes: WorkflowNode[]) {
  return nodes.some((node) => hiddenUiNodeKinds.has(normalizeNodeKind(node.data.kind)));
}
