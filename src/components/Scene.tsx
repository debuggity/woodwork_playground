import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { useStore } from '../store';
import { PartObject } from './PartObject';

export const Scene: React.FC = () => {
  const { parts, selectPart, setHoveredId, floorEnabled } = useStore();
  const blurActiveInput = () => {
    const activeElement = document.activeElement as HTMLElement | null;
    if (!activeElement) return;
    const tag = activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      activeElement.blur();
    }
  };

  const assemblyCenter = useMemo<[number, number, number]>(() => {
    if (parts.length === 0) return [0, 0, 0];

    const sum = parts.reduce(
      (acc, part) => {
        acc[0] += part.position[0];
        acc[1] += part.position[1];
        acc[2] += part.position[2];
        return acc;
      },
      [0, 0, 0] as [number, number, number]
    );

    return [sum[0] / parts.length, sum[1] / parts.length, sum[2] / parts.length];
  }, [parts]);

  const handleMissed = () => {
    selectPart(null);
    setHoveredId(null);
  };

  return (
    <div className="w-full h-full bg-slate-100 touch-none" onPointerDownCapture={blurActiveInput}>
      <Canvas
        shadows
        camera={{ position: [50, 50, 50], fov: 45 }}
        onPointerMissed={handleMissed}
        eventPrefix="client"
        style={{ touchAction: 'none' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[50, 50, 25]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <Environment preset="city" />

        <Grid
          args={[1000, 1000]}
          cellSize={1} // 1 inch grid
          cellThickness={0.5}
          cellColor="#e5e7eb"
          sectionSize={12} // 1 foot major lines
          sectionThickness={1}
          sectionColor="#d1d5db"
          fadeDistance={500}
          infiniteGrid
        />
        
        {/* Ground plane for reference */}
        {floorEnabled && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <planeGeometry args={[1000, 1000]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
        )}

        {parts.map((part, index) => (
          <PartObject
            key={part.id}
            data={part}
            partIndex={index}
            totalParts={parts.length}
            assemblyCenter={assemblyCenter}
          />
        ))}

        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
};
