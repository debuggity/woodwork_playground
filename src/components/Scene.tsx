import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { useStore } from '../store';
import { PartObject } from './PartObject';

export const Scene: React.FC = () => {
  const { parts, selectPart, floorEnabled } = useStore();

  const handleMissed = () => {
    selectPart(null);
  };

  return (
    <div className="w-full h-full bg-slate-100">
      <Canvas
        shadows
        camera={{ position: [50, 50, 50], fov: 45 }}
        onPointerMissed={handleMissed}
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

        {parts.map((part) => (
          <PartObject key={part.id} data={part} />
        ))}

        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
};
