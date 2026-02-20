import { useEffect, useState } from 'react';
import { PanelLeft, PanelRight, X } from 'lucide-react';
import { Scene } from './Scene';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import { BOM } from './BOM';
import { useStore } from '../store';

const PENDING_PROJECT_IMPORT_KEY = 'woodworker_pending_project_import_asset';
const PENDING_PROJECT_IMPORT_PAYLOAD_KEY = 'woodworker_pending_project_import_payload';

export function Workbench() {
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const setParts = useStore((state) => state.setParts);
  const requestCameraFocus = useStore((state) => state.requestCameraFocus);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const queuedPayload = window.localStorage.getItem(PENDING_PROJECT_IMPORT_PAYLOAD_KEY);
    const queuedAsset = window.localStorage.getItem(PENDING_PROJECT_IMPORT_KEY);
    if (!queuedAsset && !queuedPayload) return;

    window.localStorage.removeItem(PENDING_PROJECT_IMPORT_PAYLOAD_KEY);
    window.localStorage.removeItem(PENDING_PROJECT_IMPORT_KEY);
    const normalizedAsset = queuedAsset ? queuedAsset.replace(/^\/+/, '') : '';
    const baseUrl = window.location.href.split('#')[0];
    const assetCandidates = normalizedAsset
      ? [
          new URL(normalizedAsset, baseUrl).toString(),
          new URL(`/${normalizedAsset}`, window.location.origin).toString(),
        ]
      : [];
    let isCancelled = false;

    const loadQueuedProject = async () => {
      try {
        let parsed: unknown = null;
        let loaded = false;

        if (queuedPayload) {
          parsed = JSON.parse(queuedPayload);
          loaded = true;
        }

        if (!loaded) {
          for (const candidate of assetCandidates) {
            const response = await fetch(candidate, { cache: 'no-store' });
            if (!response.ok) continue;
            parsed = await response.json();
            loaded = true;
            break;
          }
        }

        if (!loaded) {
          throw new Error('Failed to fetch import asset from all candidate paths');
        }

        const importedParts = Array.isArray(parsed) ? parsed : parsed?.parts;

        if (!Array.isArray(importedParts)) {
          throw new Error('Invalid file format: expected parts array');
        }

        if (isCancelled) return;
        setParts(importedParts);
        window.requestAnimationFrame(() => requestCameraFocus());
      } catch (error) {
        console.error('Failed to load queued project import', error);
        alert('Could not auto-load the queued project file.');
      }
    };

    void loadQueuedProject();
    return () => {
      isCancelled = true;
    };
  }, [requestCameraFocus, setParts]);

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
