import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  Bot,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Code2,
  Database,
  GitBranch,
  Mail,
  Plus,
  PlugZap,
  Route,
  Send,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Split,
  Table2,
  Trash2,
  Upload,
  UserCheck,
  WifiOff,
} from 'lucide-react';
import { connectGmail, disconnectGmail, getGmailConnectionStatus } from '../services/api';
import { normalizeNodeKind } from '../nodeCapabilities';
import type { WorkflowNodeData, WorkflowNodeField, WorkflowNodeValue } from '../types/workflow';

type PropertiesPanelProps = {
  selectedNode: {
    id: string;
    data: WorkflowNodeData;
  } | null;
  onUpdateNode: (id: string, field: WorkflowNodeField, value: WorkflowNodeValue) => void;
};

type SectionProps = {
  title: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
};

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/10';

const smallButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-400/50 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-100';

const providerOptions = ['OpenAI', 'Gemini', 'Groq'];
const inputFieldOptions = [
  { value: 'email_subject', label: 'Email Subject' },
  { value: 'email_body', label: 'Email Body' },
  { value: 'email_subject_and_body', label: 'Email Subject + Body' },
  { value: 'input', label: 'Current Input' },
];
const operatorOptions = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'less_than',
  'greater_than_or_equal',
  'less_than_or_equal',
  'exists',
  'not_exists',
];

function Section({ title, subtitle, icon: Icon, children }: SectionProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/50">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h4>
          {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
      {label}
      {children}
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = 'text',
  step,
  disabled = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
  step?: string;
  disabled?: boolean;
}) {
  return (
    <FieldLabel label={label}>
      <input type={type} step={step} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={inputClass} />
    </FieldLabel>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <FieldLabel label={label}>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} min-h-28 resize-y leading-6`} />
    </FieldLabel>
  );
}

function SelectInput({ label, value, options, onChange }: { label: string; value: string; options: Array<string | { value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <FieldLabel label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        {options.map((option) => {
          const optionValue = typeof option === 'string' ? option : option.value;
          const optionLabel = typeof option === 'string' ? option : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </FieldLabel>
  );
}

function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
      <span>{label}</span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-200 transition dark:bg-slate-700">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
        <span className="absolute inset-0 rounded-full transition peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-cyan-400 dark:peer-checked:from-cyan-400 dark:peer-checked:to-violet-500" />
        <span className="absolute left-1 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function StringListEditor({
  title,
  items,
  addLabel,
  addValue,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  items: string[];
  addLabel: string;
  addValue: string;
  onAdd: (value: string) => void;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
        <button type="button" onClick={() => onAdd(addValue)} className={smallButtonClass}>
          <Plus className="h-3.5 w-3.5" />
          {addLabel}
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item, index) => (
            <div key={`${item}-${index}`} className="flex gap-2">
              <input value={item} onChange={(event) => onChange(index, event.target.value)} className={inputClass} />
              <button type="button" onClick={() => onRemove(index)} className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20" aria-label={`Remove ${title.toLowerCase()} item`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">No entries configured.</p>
        )}
      </div>
    </div>
  );
}

function getNodeIcon(kind: string) {
  const icons: Record<string, ComponentType<{ className?: string }>> = {
    'email-trigger': Mail,
    llm: Sparkles,
    extractor: Table2,
    classifier: Bot,
    summarizer: BrainCircuit,
    condition: Split,
    router: Route,
    'send-email': Send,
    calendar: CalendarClock,
    'http-api': Code2,
    database: Database,
    'rag-incident-memory': PlugZap,
    'file-upload': Upload,
  };

  return icons[kind] ?? Settings2;
}

function PropertiesPanel({ selectedNode, onUpdateNode }: PropertiesPanelProps) {
  const [gmailStatus, setGmailStatus] = useState<'idle' | 'loading' | 'connected' | 'disconnected' | 'error'>('idle');
  const [gmailMessage, setGmailMessage] = useState('');
  const normalizedKind = normalizeNodeKind(selectedNode?.data.kind);
  const NodeIcon = useMemo(() => getNodeIcon(normalizedKind), [normalizedKind]);

  useEffect(() => {
    if (!selectedNode || normalizeNodeKind(selectedNode.data.kind) !== 'email-trigger') {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'gmail-oauth-success') {
        setGmailStatus('connected');
        setGmailMessage('Gmail connected.');
      }
      if (event.data?.type === 'gmail-oauth-error') {
        setGmailStatus('error');
        setGmailMessage('Gmail connection failed.');
      }
    };

    window.addEventListener('message', handleMessage);

    let active = true;
    setGmailStatus('loading');
    getGmailConnectionStatus()
      .then((status) => {
        if (!active) {
          return;
        }
        setGmailStatus(status.connected ? 'connected' : 'disconnected');
        setGmailMessage(status.connected ? 'Gmail connected.' : 'No Gmail connection.');
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setGmailStatus('error');
        setGmailMessage('Unable to check Gmail connection.');
      });

    return () => {
      active = false;
      window.removeEventListener('message', handleMessage);
    };
  }, [selectedNode?.id, selectedNode?.data.kind]);

  if (!selectedNode) {
    return (
      <aside className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/50">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200">
          <SlidersHorizontal className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-950 dark:text-white">Properties</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Select a node to edit its settings, runtime, and routing behavior.</p>
      </aside>
    );
  }

  const categories = Array.isArray(selectedNode.data.categories) ? selectedNode.data.categories : [];
  const extractionFields = Array.isArray(selectedNode.data.extractionFields) ? selectedNode.data.extractionFields : [];
  const routes = Array.isArray(selectedNode.data.routes) ? selectedNode.data.routes : [];
  const gmailStatusClass = {
    idle: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    loading: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200',
    connected: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200',
    disconnected: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200',
    error: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200',
  }[gmailStatus];

  return (
    <aside className="space-y-4">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-500/20 dark:from-cyan-400 dark:to-violet-500">
            <NodeIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-blue-600 dark:text-cyan-300">Properties</p>
            <h3 className="mt-1 truncate text-base font-semibold text-slate-950 dark:text-white">{selectedNode.data.label}</h3>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{selectedNode.data.kind}</p>
          </div>
        </div>
      </section>

      <Section title="Identity" subtitle="Core node labels and descriptive metadata." icon={Settings2}>
        <TextInput label="Node Name" value={selectedNode.data.label} onChange={(value) => onUpdateNode(selectedNode.id, 'label', value)} />
        <TextInput label="Node Type" value={selectedNode.data.nodeType} onChange={(value) => onUpdateNode(selectedNode.id, 'nodeType', value)} />
        <TextArea label="Description" value={selectedNode.data.description} onChange={(value) => onUpdateNode(selectedNode.id, 'description', value)} />
      </Section>

      {normalizedKind === 'email-trigger' ? (
        <Section title="Email Trigger" subtitle="Connect Gmail and define inbox filtering." icon={Mail}>
          <TextInput label="Email Account" value={selectedNode.data.emailAccount ?? ''} onChange={(value) => onUpdateNode(selectedNode.id, 'emailAccount', value)} />
          <TextInput label="Folder" value={selectedNode.data.folder ?? 'INBOX'} onChange={(value) => onUpdateNode(selectedNode.id, 'folder', value)} />
          <TextInput label="Subject Filter" value={selectedNode.data.subjectFilter ?? ''} onChange={(value) => onUpdateNode(selectedNode.id, 'subjectFilter', value)} />
          <SwitchField label="Unread only" checked={Boolean(selectedNode.data.unreadOnly)} onChange={(value) => onUpdateNode(selectedNode.id, 'unreadOnly', value)} />

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Gmail Connection</p>
                {gmailMessage ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{gmailMessage}</p> : null}
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${gmailStatusClass}`}>
                {gmailStatus === 'connected' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {gmailStatus === 'loading' ? 'Checking' : gmailStatus === 'connected' ? 'Connected' : gmailStatus === 'error' ? 'Error' : 'Disconnected'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setGmailStatus('loading');
                  setGmailMessage('Opening Google consent screen...');
                  connectGmail()
                    .then(({ auth_url }) => {
                      window.open(auth_url, '_blank', 'width=600,height=700');
                      setGmailStatus('loading');
                      setGmailMessage('Complete the Google consent screen to connect Gmail.');
                    })
                    .catch(() => {
                      setGmailStatus('error');
                      setGmailMessage('Unable to start Gmail connection.');
                    });
                }}
                className={smallButtonClass}
              >
                Connect Gmail
              </button>
              <button
                type="button"
                onClick={() => {
                  setGmailStatus('loading');
                  disconnectGmail()
                    .then(() => {
                      setGmailStatus('disconnected');
                      setGmailMessage('Disconnected from Gmail.');
                    })
                    .catch(() => {
                      setGmailStatus('error');
                      setGmailMessage('Unable to disconnect Gmail.');
                    });
                }}
                className={smallButtonClass}
              >
                Disconnect
              </button>
            </div>
          </div>
        </Section>
      ) : null}

      {normalizedKind === 'scheduler' ? (
        <Section title="Scheduler" subtitle="Define when this workflow trigger becomes due." icon={CalendarClock}>
          <SelectInput
            label="Schedule Type"
            value={selectedNode.data.scheduleType ?? 'interval'}
            options={[
              { value: 'interval', label: 'Interval' },
              { value: 'once', label: 'Run once' },
              { value: 'cron', label: 'Cron expression' },
            ]}
            onChange={(value) => onUpdateNode(selectedNode.id, 'scheduleType', value)}
          />
          {(selectedNode.data.scheduleType ?? 'interval') === 'interval' ? (
            <TextInput
              label="Interval (minutes)"
              type="number"
              value={selectedNode.data.intervalMinutes ?? 1}
              onChange={(value) => onUpdateNode(selectedNode.id, 'intervalMinutes', Number(value))}
            />
          ) : null}
          {(selectedNode.data.scheduleType ?? 'interval') === 'cron' ? (
            <TextInput
              label="Cron Expression"
              value={selectedNode.data.cronExpression ?? ''}
              onChange={(value) => onUpdateNode(selectedNode.id, 'cronExpression', value)}
            />
          ) : null}
        </Section>
      ) : null}

      {normalizedKind === 'file-upload' ? (
        <Section title="File Upload" subtitle="Select a file to persist its content and metadata with this workflow." icon={Upload}>
          <label className={smallButtonClass}>
            <Upload className="h-4 w-4" />
            {selectedNode.data.fileName ? 'Replace file' : 'Select file'}
            <input
              type="file"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const dataUrl = String(reader.result ?? '');
                  const separator = dataUrl.indexOf(',');
                  const fileContentBase64 = separator >= 0 ? dataUrl.slice(separator + 1) : dataUrl;
                  const fileReference = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                    ? crypto.randomUUID()
                    : `file-${Date.now()}`;
                  onUpdateNode(selectedNode.id, 'fileReference', fileReference);
                  onUpdateNode(selectedNode.id, 'fileName', file.name);
                  onUpdateNode(selectedNode.id, 'fileMimeType', file.type || 'application/octet-stream');
                  onUpdateNode(selectedNode.id, 'fileSize', file.size);
                  onUpdateNode(selectedNode.id, 'fileLastModified', file.lastModified);
                  onUpdateNode(selectedNode.id, 'fileContentBase64', fileContentBase64);
                };
                reader.readAsDataURL(file);
                event.target.value = '';
              }}
            />
          </label>
          {selectedNode.data.fileName ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
              <p className="font-semibold">{selectedNode.data.fileName}</p>
              <p className="mt-1 text-xs">{selectedNode.data.fileMimeType || 'Unknown type'} · {selectedNode.data.fileSize ?? 0} bytes</p>
              <p className="mt-1 break-all text-xs">Reference: {selectedNode.data.fileReference || 'Pending'}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">A file is required before execution.</p>
          )}
        </Section>
      ) : null}

      {['llm', 'classifier', 'extractor', 'summarizer'].includes(normalizedKind) ? (
        <Section title="AI Runtime" subtitle="Provider, model, input, and generation settings." icon={Sparkles}>
          <SelectInput label="Provider" value={selectedNode.data.provider || (normalizedKind === 'llm' ? 'OpenAI' : 'Groq')} options={providerOptions} onChange={(value) => onUpdateNode(selectedNode.id, 'provider', value)} />
          <TextInput label="Model" value={selectedNode.data.model || ''} onChange={(value) => onUpdateNode(selectedNode.id, 'model', value)} />

          {normalizedKind === 'llm' ? (
            <TextArea label="Prompt" value={selectedNode.data.prompt || ''} onChange={(value) => onUpdateNode(selectedNode.id, 'prompt', value)} />
          ) : (
            <>
              <SelectInput label="Input Field" value={selectedNode.data.inputField || 'email_subject_and_body'} options={inputFieldOptions} onChange={(value) => onUpdateNode(selectedNode.id, 'inputField', value)} />
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Current Input uses the input or output supplied by the connected upstream node.</p>
              {normalizedKind === 'classifier' ? (
                <StringListEditor
                  title="Categories"
                  items={categories}
                  addLabel="Add category"
                  addValue="new-category"
                  onAdd={(value) => onUpdateNode(selectedNode.id, 'categories', [...categories, value])}
                  onChange={(index, value) => onUpdateNode(selectedNode.id, 'categories', categories.map((item, idx) => (idx === index ? value : item)))}
                  onRemove={(index) => onUpdateNode(selectedNode.id, 'categories', categories.filter((_, idx) => idx !== index))}
                />
              ) : null}

              {normalizedKind === 'extractor' ? (
                <StringListEditor
                  title="Extraction Fields"
                  items={extractionFields}
                  addLabel="Add field"
                  addValue="new_field"
                  onAdd={(value) => onUpdateNode(selectedNode.id, 'extractionFields', [...extractionFields, value])}
                  onChange={(index, value) => onUpdateNode(selectedNode.id, 'extractionFields', extractionFields.map((item, idx) => (idx === index ? value : item)))}
                  onRemove={(index) => onUpdateNode(selectedNode.id, 'extractionFields', extractionFields.filter((_, idx) => idx !== index))}
                />
              ) : null}

              <TextArea label={normalizedKind === 'summarizer' ? 'Instructions / Prompt' : 'Instructions'} value={selectedNode.data.instructions || ''} onChange={(value) => onUpdateNode(selectedNode.id, 'instructions', value)} />
            </>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Temperature" type="number" step="0.1" value={selectedNode.data.temperature ?? (normalizedKind === 'summarizer' ? 0.2 : 0)} onChange={(value) => onUpdateNode(selectedNode.id, 'temperature', Number(value))} />
            <TextInput label="Max Tokens" type="number" value={selectedNode.data.maxTokens ?? (normalizedKind === 'classifier' ? 128 : 256)} onChange={(value) => onUpdateNode(selectedNode.id, 'maxTokens', Number(value))} />
          </div>
        </Section>
      ) : null}

      {normalizedKind === 'send-email' ? (
        <Section title="Send Email" subtitle="Configure the outbound notification." icon={Send}>
          <TextInput label="Recipient" value={selectedNode.data.recipientEmail ?? ''} onChange={(value) => onUpdateNode(selectedNode.id, 'recipientEmail', value)} />
          <TextInput label="Subject" value={selectedNode.data.subject ?? ''} onChange={(value) => onUpdateNode(selectedNode.id, 'subject', value)} />
          <TextArea label="Optional Body" value={selectedNode.data.body ?? ''} onChange={(value) => onUpdateNode(selectedNode.id, 'body', value)} />
          <SwitchField label="Use LLM Output" checked={Boolean(selectedNode.data.useLlmOutput)} onChange={(value) => onUpdateNode(selectedNode.id, 'useLlmOutput', value)} />
        </Section>
      ) : null}

      {normalizedKind === 'approval' ? (
        <Section title="Human Approval" subtitle="Choose who receives the approval request. This workflow value overrides the server default." icon={UserCheck}>
          <TextInput
            label="Approver Email"
            value={selectedNode.data.approverEmail ?? ''}
            onChange={(value) => onUpdateNode(selectedNode.id, 'approverEmail', value)}
          />
          <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Required before an approval email can be sent.</p>
        </Section>
      ) : null}

      {normalizedKind === 'condition' ? (
        <Section title="Condition" subtitle="Branch the workflow with true and false paths." icon={Split}>
          <TextInput label="Field" value={selectedNode.data.field ?? ''} onChange={(value) => onUpdateNode(selectedNode.id, 'field', value)} />
          <SelectInput label="Operator" value={selectedNode.data.operator ?? 'equals'} options={operatorOptions} onChange={(value) => onUpdateNode(selectedNode.id, 'operator', value)} />
          <TextInput label="Value" value={selectedNode.data.value ?? ''} onChange={(value) => onUpdateNode(selectedNode.id, 'value', value)} disabled={selectedNode.data.operator === 'exists' || selectedNode.data.operator === 'not_exists'} />
        </Section>
      ) : null}

      {normalizedKind === 'router' ? (
        <Section title="Router" subtitle="Evaluate routes in order and fall back to a default path." icon={GitBranch}>
          <TextInput label="Field" value={selectedNode.data.field ?? ''} onChange={(value) => onUpdateNode(selectedNode.id, 'field', value)} />
          <TextInput label="Default Route" value={selectedNode.data.defaultRoute ?? ''} onChange={(value) => onUpdateNode(selectedNode.id, 'defaultRoute', value)} />
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Routes</span>
              <button
                type="button"
                onClick={() => onUpdateNode(selectedNode.id, 'routes', [...routes, { route: `route${routes.length + 1}`, operator: 'equals', value: '' }])}
                className={smallButtonClass}
              >
                <Plus className="h-3.5 w-3.5" />
                Add route
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {routes.length ? (
                routes.map((route, index) => (
                  <div key={`${route.route}-${index}`} className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <TextInput
                      label="Route"
                      value={route.route ?? ''}
                      onChange={(value) => {
                        const nextRoutes = routes.map((item, idx) => (idx === index ? { ...item, route: value } : item));
                        onUpdateNode(selectedNode.id, 'routes', nextRoutes);
                      }}
                    />
                    <SelectInput
                      label="Operator"
                      value={route.operator ?? 'equals'}
                      options={operatorOptions}
                      onChange={(value) => {
                        const nextRoutes = routes.map((item, idx) => (idx === index ? { ...item, operator: value } : item));
                        onUpdateNode(selectedNode.id, 'routes', nextRoutes);
                      }}
                    />
                    <TextInput
                      label="Value"
                      value={route.value ?? ''}
                      disabled={route.operator === 'exists' || route.operator === 'not_exists'}
                      onChange={(value) => {
                        const nextRoutes = routes.map((item, idx) => (idx === index ? { ...item, value } : item));
                        onUpdateNode(selectedNode.id, 'routes', nextRoutes);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => onUpdateNode(selectedNode.id, 'routes', routes.filter((_, idx) => idx !== index))}
                      className="mt-5 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                      aria-label="Remove route"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">No routes configured.</p>
              )}
            </div>
          </div>
        </Section>
      ) : null}
    </aside>
  );
}

export default PropertiesPanel;
