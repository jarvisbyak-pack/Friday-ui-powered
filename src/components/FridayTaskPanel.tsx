import React from 'react';
import { CheckCircle2, CircleAlert, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';

export interface FridayTaskSummary {
  id: string; command: string; phase: string; authorizationRequired: boolean; authorizationGranted: boolean;
  target?: { resource?: string }; result?: { success: boolean; summary: string; verification: string };
  events: Array<{ at: string; phase: string; message: string }>;
}

export function FridayTaskPanel({ task, onAuthorize }: { task: FridayTaskSummary | null; onAuthorize: (approved: boolean) => void }) {
  if (!task) return null;
  const waiting = task.phase === 'AUTHORIZE' && !task.authorizationGranted;
  const failed = task.phase === 'FAILED';
  const complete = task.phase === 'COMPLETE';
  const Icon = failed ? CircleAlert : complete ? CheckCircle2 : waiting ? KeyRound : LoaderCircle;
  return (
    <section className="mx-auto mb-5 w-[calc(100%-2rem)] max-w-6xl rounded-2xl border border-stone-200 bg-white p-4 shadow-sm" aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex items-start gap-3">
          <div className={`mt-0.5 rounded-xl p-2 ${failed ? 'bg-rose-100 text-rose-700' : complete ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}><Icon className={`h-4 w-4 ${!failed && !complete ? 'animate-spin' : ''}`} /></div>
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wide text-stone-500">FRIDAY TASK · {task.phase}</p>
            <p className="truncate text-sm font-semibold text-stone-900">{task.target?.resource || task.command}</p>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">{task.result?.summary || task.events.at(-1)?.message}</p>
            {task.result && <p className="mt-1 text-[11px] font-medium text-stone-500">Verification: {task.result.verification}</p>}
          </div>
        </div>
        {waiting && <div className="flex shrink-0 gap-2"><button type="button" onClick={() => onAuthorize(false)} className="rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50">Deny</button><button type="button" onClick={() => onAuthorize(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700"><ShieldCheck className="h-3.5 w-3.5" />Authorize execution</button></div>}
      </div>
    </section>
  );
}
