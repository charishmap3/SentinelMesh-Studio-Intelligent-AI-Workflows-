import type { WorkflowEdge, WorkflowNode } from '../types/workflow';

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string;
  comingSoon?: boolean;
  executable?: boolean;
  initialName?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

function createNode(
  id: string,
  kind: string,
  label: string,
  nodeType: string,
  description: string,
  config: string,
  position: { x: number; y: number },
  dataOverrides: Partial<WorkflowNode['data']> = {},
): WorkflowNode {
  return {
    id,
    type: 'workflowNode',
    position,
    data: {
      label,
      nodeType,
      description,
      config,
      kind,
      ...dataOverrides,
    },
  };
}

const procurementNodes: WorkflowNode[] = [
  createNode(
    'requirement-validation-1',
    'requirement-validation',
    'Requirement Validation',
    'Requirement Validation',
    'Validate incoming requirements before proceeding.',
    'Rule: must include business owner',
    { x: 80, y: 80 },
  ),
  createNode(
    'approval-1',
    'approval',
    'Approval',
    'Approval',
    'Review and authorize the request.',
    'Approver: Finance Lead',
    { x: 360, y: 220 },
  ),
  createNode(
    'purchase-order-1',
    'purchase-order',
    'Purchase Order',
    'Purchase Order',
    'Create the order after approval.',
    'Creates the approved purchase order',
    { x: 640, y: 220 },
  ),
];

const procurementEdges: WorkflowEdge[] = [
  { id: 'e1', source: 'requirement-validation-1', target: 'approval-1' },
  { id: 'e2', source: 'approval-1', target: 'purchase-order-1', sourceHandle: 'approved' },
];

function createTemplateNodes(nodes: WorkflowNode[]) {
  return nodes;
}

function createTemplateEdges(edges: WorkflowEdge[]) {
  return edges;
}

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: 'procurement',
    name: 'Procurement Workflow',
    description: 'The existing multi-step procurement flow with validation and approval.',
    icon: '📦',
    executable: true,
    initialName: 'Procurement Workflow',
    nodes: procurementNodes,
    edges: procurementEdges,
  },
  {
    id: 'bakery',
    name: 'Bakery Order Automation',
    description: 'Coordinate incoming orders, baking prep, and delivery scheduling.',
    icon: '🍞',
    executable: true,
    initialName: 'Bakery Order Automation',
    nodes: createTemplateNodes([
      createNode('bakery-trigger', 'email-trigger', 'Email Trigger', 'Email Trigger', 'Receive incoming order requests from customers.', 'Starts the bakery workflow', { x: 80, y: 80 }),
      createNode('bakery-extractor', 'extractor', 'Order Extractor', 'Order Extractor', 'Extract product quantities and delivery details.', 'Parses the incoming order data', { x: 320, y: 80 }, {
        provider: 'Groq',
        model: 'openai/gpt-oss-20b',
        inputField: 'input',
        extractionFields: ['items', 'quantities', 'delivery_date'],
      }),
      createNode('bakery-inventory', 'inventory', 'Inventory Check', 'Inventory Check', 'Validate ingredients and stock availability.', 'Checks the bakery supply inventory', { x: 560, y: 80 }),
      createNode('bakery-schedule', 'scheduler', 'Schedule Baking', 'Schedule Baking', 'Plan production and baking windows.', 'Coordinates oven schedule and preparation', { x: 800, y: 80 }),
      createNode('bakery-confirmation', 'send-email', 'Send Confirmation Email', 'Send Confirmation Email', 'Notify the customer that the order is confirmed.', 'Sends the final order confirmation', { x: 1040, y: 80 }, {
        recipientEmail: 'customer@example.com',
        subject: 'Bakery order confirmation',
        body: 'Your bakery order has been confirmed.',
      }),
    ]),
    edges: createTemplateEdges([
      { id: 'bakery-e1', source: 'bakery-trigger', target: 'bakery-extractor' },
      { id: 'bakery-e2', source: 'bakery-extractor', target: 'bakery-inventory' },
      { id: 'bakery-e3', source: 'bakery-inventory', target: 'bakery-schedule' },
      { id: 'bakery-e4', source: 'bakery-schedule', target: 'bakery-confirmation' },
    ]),
  },
  {
    id: 'hr',
    name: 'HR Resume Screening',
    description: 'Route resumes through intake, screening, and interview coordination.',
    icon: '👨‍💼',
    executable: true,
    initialName: 'HR Resume Screening',
    nodes: createTemplateNodes([
      createNode('hr-upload', 'file-upload', 'Resume Upload', 'Resume Upload', 'Collect submitted resumes from candidates.', 'Receives candidate application files', { x: 80, y: 260 }, {
        fileName: 'demo-resume.txt',
        fileMimeType: 'text/plain',
        fileContentBase64: 'Q2FuZGlkYXRlIFJlc3VtZQ==',
        fileReference: 'demo-resume',
      }),
      createNode('hr-parser', 'extractor', 'Resume Parser', 'Resume Parser', 'Extract structured data from each resume.', 'Parses education and experience details', { x: 320, y: 260 }, {
        provider: 'Groq',
        model: 'openai/gpt-oss-20b',
        inputField: 'input',
        extractionFields: ['candidate_name', 'skills', 'experience'],
      }),
      createNode('hr-skill', 'classifier', 'Skill Matcher', 'Skill Matcher', 'Compare candidate skills with role requirements.', 'Matches qualifications to the role', { x: 560, y: 260 }, {
        provider: 'Groq',
        model: 'openai/gpt-oss-20b',
        categories: ['qualified', 'unqualified'],
        inputField: 'input',
      }),
      createNode('hr-ranking', 'approval', 'Candidate Ranking', 'Candidate Ranking', 'Rank candidates by fit and experience.', 'Produces a ranked shortlist', { x: 800, y: 260 }, {
        approverEmail: '',
      }),
      createNode('hr-notify', 'send-email', 'Notify HR', 'Notify HR', 'Alert the recruiting team about the shortlist.', 'Sends the shortlist to HR', { x: 1040, y: 260 }, {
        recipientEmail: 'hr@example.com',
        subject: 'Resume screening result',
        body: 'A candidate resume is ready for review.',
      }),
    ]),
    edges: createTemplateEdges([
      { id: 'hr-e1', source: 'hr-upload', target: 'hr-parser' },
      { id: 'hr-e2', source: 'hr-parser', target: 'hr-skill' },
      { id: 'hr-e3-qualified', source: 'hr-skill', target: 'hr-ranking', sourceHandle: 'qualified' },
      { id: 'hr-e3-unqualified', source: 'hr-skill', target: 'hr-ranking', sourceHandle: 'unqualified' },
      { id: 'hr-e4', source: 'hr-ranking', target: 'hr-notify', sourceHandle: 'approved' },
    ]),
  },
  {
    id: 'email',
    name: 'Email Processing',
    description: 'Automate triage and routing for incoming customer email requests.',
    icon: '📧',
    executable: true,
    initialName: 'Email Processing',
    nodes: createTemplateNodes([
      createNode('email-trigger', 'email-trigger', 'Email Trigger', 'Email Trigger', 'Receive a new inbound email.', 'Starts the email processing flow', { x: 80, y: 450 }),
      createNode('email-classifier', 'classifier', 'Email Classifier', 'Email Classifier', 'Identify whether the email is a request, complaint, or follow-up.', 'Classifies the intent of the incoming email', { x: 320, y: 450 }, {
        provider: 'Groq',
        model: 'openai/gpt-oss-20b',
        categories: ['request', 'complaint', 'follow-up'],
        inputField: 'email_subject_and_body',
      }),
      createNode('email-route', 'router', 'Route Email', 'Route Email', 'Send the email to the correct team or queue.', 'Routes the message to the appropriate workflow', { x: 560, y: 450 }, {
        field: 'category',
        defaultRoute: 'request',
        routes: [
          { route: 'request', operator: 'equals', value: 'request' },
          { route: 'complaint', operator: 'equals', value: 'complaint' },
          { route: 'follow-up', operator: 'equals', value: 'follow-up' },
        ],
      }),
      createNode('email-reply', 'send-email', 'Auto Reply', 'Auto Reply', 'Send an acknowledgement or next-step message.', 'Generates the auto response', { x: 800, y: 450 }, {
        recipientEmail: 'customer@example.com',
        subject: 'We received your email',
        body: 'Thanks for contacting us. We will follow up shortly.',
      }),
    ]),
    edges: createTemplateEdges([
      { id: 'email-e1', source: 'email-trigger', target: 'email-classifier' },
      { id: 'email-e2-request', source: 'email-classifier', target: 'email-route', sourceHandle: 'request' },
      { id: 'email-e2-complaint', source: 'email-classifier', target: 'email-route', sourceHandle: 'complaint' },
      { id: 'email-e2-follow-up', source: 'email-classifier', target: 'email-route', sourceHandle: 'follow-up' },
      { id: 'email-e3', source: 'email-route', target: 'email-reply' },
    ]),
  },
  {
    id: 'support',
    name: 'Customer Support',
    description: 'Handle support tickets with triage, escalation, and resolution steps.',
    icon: '💬',
    executable: true,
    initialName: 'Customer Support',
    nodes: createTemplateNodes([
      createNode('support-email', 'email-trigger', 'Customer Email', 'Customer Email', 'Receive the customer support request.', 'Starts the support workflow', { x: 80, y: 640 }),
      createNode('support-intent', 'classifier', 'Intent Detection', 'Intent Detection', 'Detect the customer intent and issue category.', 'Assigns the issue category', { x: 320, y: 640 }, {
        provider: 'Groq',
        model: 'openai/gpt-oss-20b',
        categories: ['support', 'billing', 'technical'],
        inputField: 'email_subject_and_body',
      }),
      createNode('support-kb', 'extractor', 'Knowledge Base', 'Knowledge Base', 'Look up relevant support guidance.', 'Finds the best known-answer content', { x: 560, y: 640 }, {
        provider: 'Groq',
        model: 'openai/gpt-oss-20b',
        inputField: 'input',
        extractionFields: ['answer', 'next_steps'],
      }),
      createNode('support-response', 'llm', 'Generate Response', 'Generate Response', 'Compose a reply that addresses the request.', 'Generates the draft support reply', { x: 800, y: 640 }, {
        provider: 'Groq',
        model: 'openai/gpt-oss-20b',
        prompt: 'Compose a concise, helpful customer support response using the available context.',
        temperature: 0.2,
        maxTokens: 256,
      }),
      createNode('support-send', 'send-email', 'Send Reply', 'Send Reply', 'Deliver the final response to the customer.', 'Sends the support reply', { x: 1040, y: 640 }, {
        recipientEmail: 'customer@example.com',
        subject: 'Support response',
        body: 'Thanks for contacting support. We have prepared a response to your request.',
        useLlmOutput: true,
      }),
    ]),
    edges: createTemplateEdges([
      { id: 'support-e1', source: 'support-email', target: 'support-intent' },
      { id: 'support-e2-support', source: 'support-intent', target: 'support-kb', sourceHandle: 'support' },
      { id: 'support-e2-billing', source: 'support-intent', target: 'support-kb', sourceHandle: 'billing' },
      { id: 'support-e2-technical', source: 'support-intent', target: 'support-kb', sourceHandle: 'technical' },
      { id: 'support-e3', source: 'support-kb', target: 'support-response' },
      { id: 'support-e4', source: 'support-response', target: 'support-send' },
    ]),
  },
  {
    id: 'blank',
    name: 'Blank Workflow',
    description: 'Start from a clean canvas for a new process design.',
    icon: '➕',
    executable: false,
    initialName: 'Blank Workflow',
    nodes: [],
    edges: [],
  },
];
