import { useState } from 'react';
import { GenieChat } from '@databricks/appkit-ui/react';
import { Pin, PinOff, Sparkles, X } from 'lucide-react';

const GENIE_ALIAS = 'reliability';

function ChatBody() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-4 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 ring-1 ring-inset ring-amber-600/15">
        Answers are AI-generated. Verify in Reliability before sharing.
      </div>
      <GenieChat
        alias={GENIE_ALIAS}
        placeholder="Ask about SAIDI, feeders, incidents…"
        className="min-h-0 flex-1"
      />
    </div>
  );
}

function DockHeader({
  pinned,
  onPinnedChange,
  onClose,
}: {
  pinned: boolean;
  onPinnedChange: (next: boolean) => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-slate-100 px-4 dark:border-white/10">
      <div className="flex items-center gap-2.5">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-50">Reliability assistant</div>
          <div className="text-[11px] leading-tight text-slate-500">Answers from Reliability gold data</div>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onPinnedChange(!pinned)}
          title={pinned ? 'Unpin from the side' : 'Pin to the side'}
          className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-slate-200"
        >
          {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function AssistantDock({
  pinned,
  onPinnedChange,
}: {
  pinned: boolean;
  onPinnedChange: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  if (pinned) {
    return (
      <aside className="sticky top-0 hidden h-screen w-[400px] shrink-0 flex-col border-l border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950 lg:flex">
        <DockHeader pinned onPinnedChange={onPinnedChange} />
        <ChatBody />
      </aside>
    );
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[min(600px,72vh)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950">
          <DockHeader pinned={false} onPinnedChange={onPinnedChange} onClose={() => setOpen(false)} />
          <ChatBody />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-12 items-center gap-2 rounded-full bg-slate-900 pl-4 pr-5 text-sm font-medium text-white shadow-lg hover:bg-slate-800"
        aria-label="Open reliability assistant"
      >
        <Sparkles className="h-4 w-4 text-blue-300" />
        Ask Reliability
      </button>
    </>
  );
}
