import { Scene } from './components/Scene';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { BOM } from './components/BOM';

export function App() {
  return (
    <div className="flex h-screen w-screen bg-slate-100 overflow-hidden">
      <Sidebar />
      
      <div className="relative flex-1 h-full">
        <Toolbar />
        <Scene />
      </div>

      <BOM />
    </div>
  );
}
