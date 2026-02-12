import React, { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { PartData } from '../types';
import { PartObject } from './PartObject';

const ControlsRecovery: React.FC = () => {
  const controls = useThree((state) => state.controls as { enabled?: boolean } | undefined);
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const recoverControls = () => {
      if (!controls) return;
      if (controls.enabled === false) {
        controls.enabled = true;
      }
    };

    const preventContextMenu = (event: Event) => {
      event.preventDefault();
      recoverControls();
    };

    const domElement = gl.domElement;
    domElement.addEventListener('contextmenu', preventContextMenu);
    domElement.addEventListener('pointercancel', recoverControls, { passive: true });
    domElement.addEventListener('touchcancel', recoverControls, { passive: true });
    domElement.addEventListener('lostpointercapture', recoverControls, { passive: true });

    window.addEventListener('pointercancel', recoverControls, { passive: true });
    window.addEventListener('touchcancel', recoverControls, { passive: true });
    window.addEventListener('blur', recoverControls);
    document.addEventListener('visibilitychange', recoverControls);

    return () => {
      domElement.removeEventListener('contextmenu', preventContextMenu);
      domElement.removeEventListener('pointercancel', recoverControls);
      domElement.removeEventListener('touchcancel', recoverControls);
      domElement.removeEventListener('lostpointercapture', recoverControls);
      window.removeEventListener('pointercancel', recoverControls);
      window.removeEventListener('touchcancel', recoverControls);
      window.removeEventListener('blur', recoverControls);
      document.removeEventListener('visibilitychange', recoverControls);
    };
  }, [controls, gl]);

  return null;
};

const AutoCenterCamera: React.FC<{ parts: PartData[]; focusToken: number }> = ({ parts, focusToken }) => {
  const controls = useThree((state) => state.controls as { target?: THREE.Vector3; update?: () => void } | undefined);
  const camera = useThree((state) => state.camera as THREE.PerspectiveCamera);

  useEffect(() => {
    if (!controls || !controls.target || !controls.update) return;

    const woodParts = parts.filter((part) => part.type !== 'hardware');
    const focusParts = woodParts.length > 0 ? woodParts : parts;
    if (focusParts.length === 0) return;

    const bounds = new THREE.Box3();
    focusParts.forEach((part) => {
      const center = new THREE.Vector3(...part.position);
      const halfSize = new THREE.Vector3(
        part.dimensions[0] / 2,
        part.dimensions[1] / 2,
        part.dimensions[2] / 2
      );
      bounds.expandByPoint(center.clone().sub(halfSize));
      bounds.expandByPoint(center.clone().add(halfSize));
    });

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bounds.getCenter(center);
    bounds.getSize(size);

    const targetRadius = Math.max(size.length() * 0.6, 18);
    const currentDirection = camera.position.clone().sub(controls.target);
    if (currentDirection.lengthSq() < 0.001) {
      currentDirection.set(1, 0.7, 1);
    }
    currentDirection.normalize();

    controls.target.copy(center);
    camera.position.copy(center.clone().add(currentDirection.multiplyScalar(targetRadius)));
    camera.near = 0.1;
    camera.far = Math.max(camera.far, targetRadius * 24);
    camera.updateProjectionMatrix();
    controls.update();
  }, [camera, controls, focusToken]);

  return null;
};

export const Scene: React.FC = () => {
  const { parts, selectPart, setHoveredId, floorEnabled, cameraFocusRequest } = useStore();
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
    <div
      className="w-full h-full bg-slate-100 touch-none select-none"
      onPointerDownCapture={blurActiveInput}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Canvas
        shadows
        camera={{ position: [50, 50, 50], fov: 45 }}
        onPointerMissed={handleMissed}
        style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      >
        <ControlsRecovery />
        <AutoCenterCamera parts={parts} focusToken={cameraFocusRequest} />
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
