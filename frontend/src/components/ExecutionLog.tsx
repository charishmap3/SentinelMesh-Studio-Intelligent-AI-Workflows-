import { useEffect, useRef } from 'react';
import { parseStringLog, formatTime } from '../utils/structuredLogs';


type LogEntry =
  | string
  | {
      timestamp?: string;
      node?: string;
      type?: string; // INFO / ERROR / SUCCESS
      status?: string;
      message?: string;
    };

type ExecutionLogProps = {
  executionLog: LogEntry[];
};

function inferToneFromMessage(text: string) {
  const t = text.toLowerCase();
  if (/failed|rejected|error/.test(t)) return { label: 'Failure', icon: '❌', border: 'border-rose-500/40', surface: 'bg-rose-500/10', dot: 'bg-rose-400' };
  if (/passed|completed|approved|generated|healthy|success/.test(t)) return { label: 'Success', icon: '✅', border: 'border-emerald-500/40', surface: 'bg-emerald-500/10', dot: 'bg-emerald-400' };
  return { label: 'Info', icon: 'ℹ️', border: 'border-cyan-500/40', surface: 'bg-cyan-500/10', dot: 'bg-cyan-400' };
}

function ExecutionLog({ executionLog }: ExecutionLogProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // auto-scroll on new entries
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [executionLog?.length]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-xl sm:p-5">
      <h3 className="mb-4 text-lg font-semibold text-slate-100">Execution Log</h3>
      <div ref={containerRef} className="max-h-96 overflow-y-auto pr-1">
        {executionLog && executionLog.length ? (
          <div className="relative ml-1 space-y-3">
            <div className="absolute left-[1.05rem] top-0 h-full w-px bg-slate-800" />
            {executionLog.map((rawEntry, index) => {
              const entry = typeof rawEntry === 'string' ? parseStringLog(rawEntry) : rawEntry;
              const tone = inferToneFromMessage(entry.message ?? '');

              const timeText = formatTime(entry.timestamp ?? null);

              return (
                <div key={`${index}-${entry.timestamp ?? entry.message ?? index}`} className={`relative flex items-start gap-3 rounded-2xl border px-3 py-3 ${tone.border} ${tone.surface}`}>
                  <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone.dot} text-sm`}>
                    {tone.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">{(entry as any).type ?? tone.label}</span>
                        {entry.node ? <span className="rounded-full bg-slate-800/40 px-2 py-0.5 text-xs text-slate-300">{entry.node}</span> : null}
                      </div>
                      {timeText ? (
                        <span className="text-xs text-slate-400" title={entry.timestamp ?? undefined}>
                          {timeText}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-200">{entry.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3 text-slate-400">No execution log available.</div>
        )}
      </div>
    </div>
  );
}

export default ExecutionLog;

