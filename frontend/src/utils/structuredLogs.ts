export type StructuredLog = {
  timestamp?: string;
  node?: string;
  type?: string; // INFO / ERROR / SUCCESS / DEBUG
  status?: string;
  message?: string;
  duration?: number | null;
};

export function parseStringLog(entry: string): StructuredLog {
  const isoMatch = entry.match(/^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+\-Z]+)\s*(?:[-|–—]\s*)?(.*)$/);
  if (isoMatch) {
    const ts = isoMatch[1];
    const rest = isoMatch[2] || '';
    const nodeMatch = rest.match(/^([^:\-\|]+)[:\-\|]\s*(.*)$/);
    if (nodeMatch) {
      return { timestamp: ts, node: nodeMatch[1].trim(), message: nodeMatch[2].trim() };
    }
    return { timestamp: ts, message: rest.trim() };
  }

  const dashParts = entry.split(' - ');
  if (dashParts.length >= 2) {
    return { message: dashParts.slice(1).join(' - ').trim(), node: dashParts[0].trim() };
  }

  return { message: entry };
}

export function toStructuredLogs(raw: Array<string | StructuredLog> | undefined): StructuredLog[] {
  if (!raw) return [];
  return raw.map((r) => (typeof r === 'string' ? parseStringLog(r) : r));
}

export function formatTime(ts?: string | Date | null) {
  if (!ts) return null;
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
