import React, { useRef, useMemo } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { PartData } from '../types';

interface PartObjectProps {
  data: PartData;
}

export const PartObject: React.FC<PartObjectProps> = React.memo(({ data }) => {
  // Optimization: Only re-render if THIS part's selection state changes
  const isSelected = useStore((state) => state.selectedId === data.id);
  const tool = useStore((state) => state.tool);
  const snapEnabled = useStore((state) => state.snapEnabled);
  const selectPart = useStore((state) => state.selectPart);
  const updatePart = useStore((state) => state.updatePart);

  const meshRef = useRef<THREE.Mesh>(null);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectPart(data.id);
  };

  // Convert array to Vector3/Euler for Three.js
  // We use useMemo to avoid recreating these objects on every render unless data changes
  const position = useMemo(() => new THREE.Vector3(...data.position), [data.position]);
  const rotation = useMemo(() => new THREE.Euler(...data.rotation), [data.rotation]);
  const [width, height, depth] = data.dimensions;

  // Handler for TransformControls changes
  const onTransformEnd = () => {
    if (meshRef.current) {
      const newPos = meshRef.current.position;
      const newRot = meshRef.current.rotation;
      
      updatePart(data.id, {
        position: [newPos.x, newPos.y, newPos.z],
        rotation: [newRot.x, newRot.y, newRot.z],
      });
    }
  };

  const showTransform = isSelected && (tool === 'move' || tool === 'rotate');
  const mode = tool === 'rotate' ? 'rotate' : 'translate';

  return (
    <>
      {showTransform && (
        <TransformControls
          object={meshRef as unknown as React.MutableRefObject<THREE.Object3D>}
          mode={mode}
          onMouseUp={onTransformEnd}
          translationSnap={snapEnabled ? 0.125 : null} // Snap to 1/8 inch if enabled
          rotationSnap={snapEnabled ? Math.PI / 8 : null} // Snap to 22.5 degrees if enabled
        />
      )}
      <mesh
        ref={meshRef}
        position={position}
        rotation={rotation}
        onClick={handleClick}
        castShadow
        receiveShadow
      >
        {data.type === 'hardware' ? (
          <cylinderGeometry args={[width / 2, width / 2, height, 16]} />
        ) : (
          <boxGeometry args={[width, height, depth]} />
        )}
        <meshStandardMaterial
          color={isSelected ? '#ff9f43' : (data.color || '#eecfa1')}
          roughness={data.type === 'hardware' ? 0.3 : 0.8}
          metalness={data.type === 'hardware' ? 0.8 : 0.1}
        />
        {/* Simple edge highlighting */}
        {data.type !== 'hardware' && (
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
            <lineBasicMaterial color={isSelected ? '#ff6b6b' : '#8d6e63'} />
          </lineSegments>
        )}
      </mesh>
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // We only re-render if the data part of the props changes, or if selection state changes for THIS part
  // However, since we pull selection from store inside the component, simple prop comparison is tricky.
  // Actually, standard React.memo checks props. 'data' is an object.
  // If the parent passes a NEW data object every time, memo won't work.
  // In Scene.tsx, we map `parts`. If `parts` array is new but object refs are same, it's fine.
  // But zustand updates create new state.
  
  // Let's rely on standard shallow comparison. If `data` reference changes, it re-renders.
  // This happens when THIS part is updated.
  // But we also need to re-render if `isSelected` changes. 
  // Since we are using hooks inside, React.memo only blocks re-renders from PARENT.
  // The hooks (useStore) will trigger re-renders internally if their selected slices change.
  // So we should optimize the useStore selectors.
  return prevProps.data === nextProps.data;
});
