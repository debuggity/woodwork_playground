import React, { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
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
    domElement.addEventListener('pointerup', recoverControls, { passive: true });
    domElement.addEventListener('mouseup', recoverControls, { passive: true });
    domElement.addEventListener('touchend', recoverControls, { passive: true });
    domElement.addEventListener('touchcancel', recoverControls, { passive: true });
    domElement.addEventListener('lostpointercapture', recoverControls, { passive: true });

    window.addEventListener('pointercancel', recoverControls, { passive: true });
    window.addEventListener('pointerup', recoverControls, { passive: true });
    window.addEventListener('mouseup', recoverControls, { passive: true });
    window.addEventListener('touchend', recoverControls, { passive: true });
    window.addEventListener('touchcancel', recoverControls, { passive: true });
    window.addEventListener('blur', recoverControls);
    document.addEventListener('visibilitychange', recoverControls);

    return () => {
      domElement.removeEventListener('contextmenu', preventContextMenu);
      domElement.removeEventListener('pointercancel', recoverControls);
      domElement.removeEventListener('pointerup', recoverControls);
      domElement.removeEventListener('mouseup', recoverControls);
      domElement.removeEventListener('touchend', recoverControls);
      domElement.removeEventListener('touchcancel', recoverControls);
      domElement.removeEventListener('lostpointercapture', recoverControls);
      window.removeEventListener('pointercancel', recoverControls);
      window.removeEventListener('pointerup', recoverControls);
      window.removeEventListener('mouseup', recoverControls);
      window.removeEventListener('touchend', recoverControls);
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
      const [halfW, halfH, halfD] = [
        part.dimensions[0] / 2,
        part.dimensions[1] / 2,
        part.dimensions[2] / 2,
      ];
      const quaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(part.rotation[0], part.rotation[1], part.rotation[2], 'XYZ')
      );

      const corners = [
        new THREE.Vector3(halfW, halfH, halfD),
        new THREE.Vector3(halfW, halfH, -halfD),
        new THREE.Vector3(halfW, -halfH, halfD),
        new THREE.Vector3(halfW, -halfH, -halfD),
        new THREE.Vector3(-halfW, halfH, halfD),
        new THREE.Vector3(-halfW, halfH, -halfD),
        new THREE.Vector3(-halfW, -halfH, halfD),
        new THREE.Vector3(-halfW, -halfH, -halfD),
      ];

      corners.forEach((corner) => {
        corner.applyQuaternion(quaternion).add(center);
        bounds.expandByPoint(corner);
      });
    });

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bounds.getCenter(center);
    bounds.getSize(size);

    const radius = Math.max(size.length() / 2, 1);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const halfFov = Math.max(0.1, Math.min(verticalFov, horizontalFov) / 2);
    const fitDistance = radius / Math.sin(halfFov);
    const targetDistance = Math.max(fitDistance * 1.25, 26);

    const currentDirection = camera.position.clone().sub(controls.target);
    if (currentDirection.lengthSq() < 0.001) {
      currentDirection.set(1, 0.7, 1);
    }
    currentDirection.normalize();

    controls.target.copy(center);
    camera.position.copy(center.clone().add(currentDirection.multiplyScalar(targetDistance)));
    camera.near = Math.max(0.05, targetDistance / 800);
    camera.far = Math.max(camera.far, targetDistance + radius * 30);
    camera.updateProjectionMatrix();
    controls.update();
  }, [camera, controls, focusToken]);

  return null;
};

export const Scene: React.FC = () => {
  const { parts, selectPart, setHoveredId, floorEnabled, shadowsEnabled, cameraFocusRequest } = useStore();
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

  const ambientIntensity = shadowsEnabled ? 0.34 : 0.5;
  const keyLightIntensity = shadowsEnabled ? 1.2 : 1;

  return (
    <div
      className="w-full h-full bg-slate-100 touch-none select-none"
      onPointerDownCapture={blurActiveInput}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Canvas
        shadows={shadowsEnabled}
        camera={{ position: [50, 50, 50], fov: 45 }}
        onPointerMissed={handleMissed}
        style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      >
        <ControlsRecovery />
        <AutoCenterCamera parts={parts} focusToken={cameraFocusRequest} />
        <ambientLight intensity={ambientIntensity} />
        <directionalLight
          position={[50, 50, 25]}
          intensity={keyLightIntensity}
          castShadow={shadowsEnabled}
          shadow-mapSize={shadowsEnabled ? [4096, 4096] : [1024, 1024]}
          shadow-bias={-0.00025}
          shadow-normalBias={0.025}
          shadow-camera-near={1}
          shadow-camera-far={280}
          shadow-camera-left={-150}
          shadow-camera-right={150}
          shadow-camera-top={150}
          shadow-camera-bottom={-150}
        />
        <directionalLight position={[-40, 35, -35]} intensity={0.25} />
        <Environment preset="city" />

        {/* Depth-tested grid helpers avoid overlay artifacts on top of model geometry. */}
        <gridHelper args={[960, 960, '#e5e7eb', '#e5e7eb']} position={[0, 0, 0]} />
        <gridHelper args={[960, 80, '#d1d5db', '#d1d5db']} position={[0, 0.001, 0]} />
        
        {/* Ground plane for reference */}
        {floorEnabled && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <planeGeometry args={[1000, 1000]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
        )}
        {shadowsEnabled && !floorEnabled && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.011, 0]} receiveShadow>
            <planeGeometry args={[1000, 1000]} />
            <shadowMaterial opacity={0.33} transparent />
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
