import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { ClipboardList, ShoppingCart } from 'lucide-react';

// Simple 1D Bin Packing (First Fit Decreasing)
const calculateShoppingList = (parts: any[]) => {
  const groups: Record<string, number[]> = {};
  const hardware: Record<string, number> = {};

  parts.forEach((part: any) => {
    if (part.type === 'hardware') {
      hardware[part.name] = (hardware[part.name] || 0) + 1;
      return;
    }

    if (!groups[part.name]) {
      groups[part.name] = [];
    }
    const length = Math.max(...part.dimensions);
    groups[part.name].push(length);
  });

  const shoppingList: Record<string, { count: number; totalLength: number; details: string }> = {};

  // Process Hardware
  Object.entries(hardware).forEach(([name, count]) => {
    shoppingList[name] = {
      count,
      totalLength: 0,
      details: `${count} unit${count > 1 ? 's' : ''}`
    };
  });

  // Process Lumber / Sheets
  const STOCK_LENGTH = 96; // 8 feet standard

  Object.entries(groups).forEach(([name, lengths]) => {
    // Sort lengths descending
    lengths.sort((a, b) => b - a);

    const bins: number[] = []; // Remaining space in each bin

    lengths.forEach((len) => {
      // Find first bin that fits
      let fitted = false;
      for (let i = 0; i < bins.length; i++) {
        if (bins[i] >= len) {
          bins[i] -= len;
          fitted = true;
          break;
        }
      }
      if (!fitted) {
        if (len > STOCK_LENGTH) {
           const count = Math.ceil(len / STOCK_LENGTH);
           for(let k=0; k<count; k++) bins.push(0); // Used up
        } else {
           bins.push(STOCK_LENGTH - len);
        }
      }
    });

    shoppingList[name] = {
      count: bins.length,
      totalLength: lengths.reduce((a, b) => a + b, 0),
      details: `${bins.length} x 8ft (96") Board${bins.length > 1 ? 's' : ''}`
    };
  });

  return shoppingList;
};

export const BOM: React.FC = () => {
  const { parts } = useStore();
  const [tab, setTab] = useState<'cut' | 'shop'>('cut');

  const shoppingList = useMemo(() => calculateShoppingList(parts), [parts]);

  return (
    <div className="w-80 bg-white border-l border-slate-200 h-full flex flex-col z-10 overflow-hidden">
      <div className="p-4 border-b border-slate-200">
        <h2 className="font-semibold text-lg text-slate-800">Bill of Materials</h2>
        <div className="flex gap-2 mt-4 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setTab('cut')}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              tab === 'cut'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ClipboardList size={14} />
            Cut List
          </button>
          <button
            onClick={() => setTab('shop')}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              tab === 'shop'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ShoppingCart size={14} />
            Shopping List
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {parts.length === 0 ? (
          <div className="text-center text-slate-400 py-8">
            Scene is empty.
          </div>
        ) : (
          <>
            {tab === 'cut' && (
              <div className="space-y-4">
                 <div className="flex justify-between text-xs font-semibold text-slate-500 pb-2 border-b border-slate-100">
                    <span>Part Name</span>
                    <span>Dimensions (W x H x L)</span>
                 </div>
                 {parts.map((part, index) => (
                   <div key={part.id} className="flex justify-between items-center text-sm py-2 border-b border-slate-50 last:border-0">
                     <div className="font-medium text-slate-700 flex items-center gap-2">
                        <span className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[10px] text-slate-500">
                          {index + 1}
                        </span>
                        {part.name}
                     </div>
                     <div className="text-slate-500 font-mono text-xs">
                        {part.dimensions[0].toFixed(1)}" x {part.dimensions[1].toFixed(1)}" x {part.dimensions[2].toFixed(1)}"
                     </div>
                   </div>
                 ))}
                 <div className="text-xs text-slate-400 mt-4 text-center">
                    Total Parts: {parts.length}
                 </div>
              </div>
            )}

            {tab === 'shop' && (
              <div className="space-y-6">
                {Object.entries(shoppingList).map(([name, info]) => (
                  <div key={name} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="font-semibold text-slate-800 mb-1">{name}</div>
                    <div className="flex justify-between items-end">
                      <div className="text-xs text-slate-500">
                        <div>Est. Material:</div>
                        <div className="font-medium text-slate-700">{info.details}</div>
                      </div>
                      <div className="text-xl font-bold text-blue-600">
                        {info.count} <span className="text-sm font-normal text-slate-500">qty</span>
                      </div>
                    </div>
                  </div>
                ))}
                 <div className="text-xs text-slate-400 mt-4 text-center italic">
                    Calculated for 96" (8ft) stock lengths.<br/>
                    Does not account for kerf width.
                 </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
