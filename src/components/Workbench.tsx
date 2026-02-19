import { useState } from 'react';
import { PanelLeft, PanelRight, X } from 'lucide-react';
import { Scene } from './Scene';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import { BOM } from './BOM';

export function Workbench() {
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  return (
    <div className="h-dvh w-screen bg-slate-100 overflow-hidden overscroll-none">
      <div className="flex h-full w-full">
        <div className="hidden lg:block lg:w-[clamp(15rem,24vw,20rem)] lg:min-w-[15rem] lg:max-w-[20rem] shrink-0 h-full min-h-0">
          <Sidebar />
        </div>

        <div className="relative flex-1 min-w-0 h-full">
          <Toolbar />

          <div className="absolute top-3 left-3 z-20 flex gap-2">
            <button
              onClick={() => setLeftPanelOpen(true)}
              className="lg:hidden p-2 rounded-md bg-white/95 text-slate-700 shadow border border-slate-200 hover:bg-white"
              title="Open Build/Scene Panel"
            >
              <PanelLeft size={18} />
            </button>
            <button
              onClick={() => setRightPanelOpen(true)}
              className="xl:hidden p-2 rounded-md bg-white/95 text-slate-700 shadow border border-slate-200 hover:bg-white"
              title="Open Bill of Materials"
            >
              <PanelRight size={18} />
            </button>
          </div>

          <Scene />
        </div>

        <div className="hidden xl:block xl:w-[clamp(15rem,24vw,20rem)] xl:min-w-[15rem] xl:max-w-[20rem] shrink-0 h-full min-h-0">
          <BOM />
        </div>
      </div>

      {leftPanelOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setLeftPanelOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[min(22rem,88vw)] bg-white shadow-2xl border-r border-slate-200 flex flex-col">
            <div className="h-11 shrink-0 border-b border-slate-200 bg-white/95 px-2 flex items-center justify-end">
              <button
                onClick={() => setLeftPanelOpen(false)}
                className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-500"
                title="Close panel"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <Sidebar />
            </div>
          </div>
        </div>
      )}

      {rightPanelOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setRightPanelOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-[min(22rem,88vw)] bg-white shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="h-11 shrink-0 border-b border-slate-200 bg-white/95 px-2 flex items-center justify-end">
              <button
                onClick={() => setRightPanelOpen(false)}
                className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-500"
                title="Close panel"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <BOM />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
