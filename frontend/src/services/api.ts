import axios from 'axios';
import type { WorkflowPayload, WorkflowExecutionResult, WorkflowRecord } from '../types/workflow';

export type GmailConnectionStatus = {
  connected: boolean;
  configured: boolean;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  timeout: 10000,
});

function workflowRuntimeMetadata(payload: WorkflowPayload) {
  const fileNode = payload.nodes.find((node) => node.data.kind === 'file-upload');
  const extractor = payload.nodes.find((node) => node.data.kind === 'extractor');
  const summarizer = payload.nodes.find((node) => node.data.kind === 'summarizer');
  return {
    apiBaseUrl: api.defaults.baseURL,
    nodeCount: payload.nodes.length,
    nodeIds: payload.nodes.map((node) => node.id),
    fileUploadNodeId: fileNode?.id ?? null,
    hasFileContentBase64: Boolean(fileNode?.data.fileContentBase64),
    fileContentBase64Length: fileNode?.data.fileContentBase64?.length ?? 0,
    fileName: fileNode?.data.fileName ?? null,
    extractorInputField: extractor?.data.inputField ?? null,
    summarizerInputField: summarizer?.data.inputField ?? null,
  };
}

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred.';
}

export async function saveWorkflow(payload: WorkflowPayload): Promise<WorkflowRecord> {
  try {
    console.info('WORKFLOW_PERSIST_DEBUG POST', {
      url: `${api.defaults.baseURL}/workflows`,
      method: 'POST',
      ...workflowRuntimeMetadata(payload),
    });
    const response = await api.post<WorkflowRecord>('/workflows', payload);
    console.info('WORKFLOW_PERSIST_DEBUG POST_RESPONSE', {
      status: response.status,
      workflowId: response.data.workflow_id,
      ...workflowRuntimeMetadata(response.data),
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function updateWorkflow(workflowId: string, payload: WorkflowPayload): Promise<WorkflowRecord> {
  try {
    console.info('WORKFLOW_PERSIST_DEBUG PUT', {
      workflowId,
      url: `${api.defaults.baseURL}/workflows/${workflowId}`,
      method: 'PUT',
      ...workflowRuntimeMetadata(payload),
    });
    const response = await api.put<WorkflowRecord>(`/workflows/${workflowId}`, payload);
    console.info('WORKFLOW_PERSIST_DEBUG PUT_RESPONSE', {
      status: response.status,
      workflowId: response.data.workflow_id,
      ...workflowRuntimeMetadata(response.data),
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function loadWorkflow(workflowId: string): Promise<WorkflowRecord> {
  try {
    const response = await api.get<WorkflowRecord>(`/workflows/${workflowId}`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function listWorkflows(): Promise<WorkflowRecord[]> {
  try {
    const response = await api.get<WorkflowRecord[]>('/workflows');
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
  try {
    await api.delete(`/workflows/${workflowId}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function executeWorkflow(workflowId: string): Promise<WorkflowExecutionResult> {
  try {
    console.info('WORKFLOW_EXECUTE_DEBUG REQUEST', {
      workflowId,
      url: `${api.defaults.baseURL}/workflows/${workflowId}/execute`,
      method: 'POST',
    });
    const response = await api.post<WorkflowExecutionResult>(`/workflows/${workflowId}/execute`, undefined, {
      timeout: 30000,
    });
    console.info('WORKFLOW_EXECUTE_DEBUG RESPONSE', {
      status: response.status,
      workflowId: response.data.workflow_id,
      executionId: response.data.execution_id,
      executionStatus: response.data.execution_status,
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function approveWorkflow(workflowId: string, payload: { approver?: string; reason?: string }): Promise<WorkflowExecutionResult> {
  try {
    const response = await api.post<WorkflowExecutionResult>(`/workflows/${workflowId}/approve`, payload, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function rejectWorkflow(workflowId: string, payload: { rejectedBy?: string; reason?: string }): Promise<WorkflowExecutionResult> {
  try {
    const response = await api.post<WorkflowExecutionResult>(`/workflows/${workflowId}/reject`, payload, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getGmailConnectionStatus(): Promise<GmailConnectionStatus> {
  try {
    const response = await api.get<GmailConnectionStatus>('/gmail/oauth/status');
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function connectGmail(): Promise<{ auth_url: string }> {
  try {
    const response = await api.get<{ auth_url: string }>('/gmail/oauth/authorize');
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function disconnectGmail(): Promise<GmailConnectionStatus> {
  try {
    const response = await api.delete<GmailConnectionStatus>('/gmail/oauth/disconnect');
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export { getErrorMessage };
