import { useState } from 'react';
import { PanelLeft, PanelRight, X } from 'lucide-react';
import { Scene } from './components/Scene';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { BOM } from './components/BOM';

export function App() {
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
          <div className="absolute inset-y-0 left-0 w-[min(22rem,88vw)] bg-white shadow-2xl border-r border-slate-200">
            <button
              onClick={() => setLeftPanelOpen(false)}
              className="absolute right-2 top-2 p-2 rounded-md hover:bg-slate-100 text-slate-500 z-10"
              title="Close panel"
            >
              <X size={18} />
            </button>
            <Sidebar />
          </div>
        </div>
      )}

      {rightPanelOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setRightPanelOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-[min(22rem,88vw)] bg-white shadow-2xl border-l border-slate-200">
            <button
              onClick={() => setRightPanelOpen(false)}
              className="absolute left-2 top-2 p-2 rounded-md hover:bg-slate-100 text-slate-500 z-10"
              title="Close panel"
            >
              <X size={18} />
            </button>
            <BOM />
          </div>
        </div>
      )}
    </div>
  );
}
