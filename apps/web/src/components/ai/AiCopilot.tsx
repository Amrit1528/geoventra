'use client';

import { type ReactElement, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react';
import { Button, Card, CardContent } from '@geoventra/ui';
import { askIntelligenceAssistant } from '@/lib/intelligence-api';
import { cn } from '@geoventra/ui';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  data?: any;
  intent?: string;
}

const BASE_QUICK_PROMPTS = [
  'Which vehicles are offline?',
  'Which vehicles have been idle for too long?',
  'Which drivers are overspeeding?',
  'Which vehicles need maintenance?',
  'Which insurance policies are expiring?',
  'Summarize fleet performance today.',
];

export function AiCopilot({ vehicleId }: { vehicleId?: string | null }): ReactElement {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const quickPrompts = [...BASE_QUICK_PROMPTS, ...(vehicleId ? ['Why is the selected vehicle showing a warning?'] : [])];

  const askMutation = useMutation({
    mutationFn: (question: string) => askIntelligenceAssistant(question, vehicleId ? { vehicleId } : undefined),
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: data?.answer ?? 'No response.', data: data?.data, intent: data?.intent }]);
    },
    onError: () => {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Unable to reach the AI assistant right now.' }]);
    },
  });

  function send(question: string) {
    const q = question.trim();
    if (!q) return;
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');
    askMutation.mutate(q);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open AI Fleet Copilot"
        className="fixed bottom-5 right-5 z-[1001] flex h-12 w-12 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-teal-400"
      >
        <Bot size={22} />
      </button>

      {open ? (
        <div className="fixed bottom-20 right-5 z-[1001] w-[360px] max-w-[calc(100vw-2.5rem)]">
          <Card className="shadow-2xl">
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-teal-600" />
                  <span className="text-sm font-bold text-[var(--text-primary)]">AI Fleet Copilot</span>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close copilot" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <X size={16} />
                </button>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-app)] p-2">
                {messages.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">Ask anything about your fleet. Answers use live backend data only.</p>
                ) : (
                  messages.map((m, i) => (
                    <div key={i} className={cn('rounded-lg px-3 py-2 text-xs', m.role === 'user' ? 'ml-6 bg-teal-600 text-white' : 'mr-6 bg-[var(--bg-surface)] text-[var(--text-primary)]')}>
                      <div>{m.content}</div>
                      {m.role === 'assistant' && m.data ? <CopilotResults data={m.data} intent={m.intent} /> : null}
                    </div>
                  ))
                )}
                {askMutation.isPending ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <Loader2 size={12} className="animate-spin" /> Thinking…
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {quickPrompts.map((p) => (
                  <button key={p} type="button" onClick={() => send(p)} className="rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:border-teal-300 hover:text-[var(--text-primary)]">
                    {p}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') send(input); }}
                  placeholder="Ask about your fleet…"
                  className="h-9 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  aria-label="Ask AI Fleet Copilot"
                />
                <Button size="sm" onClick={() => send(input)} disabled={askMutation.isPending}>
                  <Send size={14} />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}


function CopilotResults({ data, intent }: { data: any; intent?: string }): ReactElement | null {
  if (intent === 'offline_vehicles' && Array.isArray(data.offlineVehicles)) {
    if (data.offlineVehicles.length === 0) return <div className="mt-2 text-[11px] text-[var(--text-muted)]">No offline vehicles.</div>;
    return (
      <div className="mt-2 space-y-1">
        {data.offlineVehicles.map((v: any) => (
          <a key={v.id} href={`/tracking?vehicle=${encodeURIComponent(v.id)}`} className="block rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1 text-[11px] hover:border-teal-300">
            <b>{v.registrationNumber}</b> · last report {v.lastRecordedAt ? new Date(v.lastRecordedAt).toLocaleString() : 'never'}
          </a>
        ))}
      </div>
    );
  }
  if (intent === 'idle_vehicles' && Array.isArray(data.idleVehicles)) {
    if (data.idleVehicles.length === 0) return <div className="mt-2 text-[11px] text-[var(--text-muted)]">No idle vehicles.</div>;
    return (
      <div className="mt-2 space-y-1">
        {data.idleVehicles.map((v: any) => (
          <a key={v.id} href={`/tracking?vehicle=${encodeURIComponent(v.id)}`} className="block rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1 text-[11px] hover:border-teal-300">
            <b>{v.registrationNumber}</b> · idle since {v.lastRecordedAt ? new Date(v.lastRecordedAt).toLocaleString() : 'unknown'}
            {data.longIdleVehicles?.some((x: any) => x.id === v.id) ? ' · long idle' : ''}
          </a>
        ))}
      </div>
    );
  }
  if (intent === 'overspeeding') {
    const rows = data.overspeedingVehicles ?? [];
    if (rows.length === 0 && !(data.overspeedingDrivers?.length)) return <div className="mt-2 text-[11px] text-[var(--text-muted)]">No overspeeding vehicles.</div>;
    return (
      <div className="mt-2 space-y-1">
        {rows.map((v: any) => (
          <a key={v.id} href={`/tracking?vehicle=${encodeURIComponent(v.id)}`} className="block rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1 text-[11px] hover:border-teal-300">
            <b>{v.registrationNumber}</b> · {v.speedKph} km/h
          </a>
        ))}
        {Array.isArray(data.overspeedingDrivers) && data.overspeedingDrivers.length > 0 ? (
          <div className="text-[11px] text-[var(--text-muted)]">Drivers with overspeeding events: {data.overspeedingDrivers.map((d: any) => d.name).join(', ')}</div>
        ) : null}
      </div>
    );
  }
  if (intent === 'maintenance' && Array.isArray(data.predictions)) {
    if (data.predictions.length === 0) return <div className="mt-2 text-[11px] text-[var(--text-muted)]">No maintenance predictions.</div>;
    return (
      <div className="mt-2 space-y-1">
        {data.predictions.slice(0, 8).map((p: any) => (
          <a key={p.id} href={`/vehicles`} className="block rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1 text-[11px] hover:border-teal-300">
            <b>{p.vehicleRegistration}</b> · {p.riskLevel} · {p.issueTitle}
          </a>
        ))}
      </div>
    );
  }
  if (intent === 'insurance_expiry' && Array.isArray(data.expiringInsurance)) {
    if (data.expiringInsurance.length === 0) return <div className="mt-2 text-[11px] text-[var(--text-muted)]">No expiring policies.</div>;
    return (
      <div className="mt-2 space-y-1">
        {data.expiringInsurance.map((r: any, i: number) => (
          <div key={i} className="rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1 text-[11px]">
            <b>{r.registrationNumber}</b> · expires {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : '—'}
          </div>
        ))}
      </div>
    );
  }
  if (intent === 'fleet_summary' && data.fleet) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
        <div>Total: <b>{data.fleet.totalVehicles}</b></div>
        <div>Active: <b>{data.fleet.activeVehicles}</b></div>
        <div>Moving: <b>{data.fleet.moving}</b></div>
        <div>Idle: <b>{data.fleet.idle}</b></div>
        <div>Offline: <b>{data.fleet.offline}</b></div>
        <div>Disabled: <b>{data.fleet.disabledVehicles}</b></div>
      </div>
    );
  }
  return null;
}
