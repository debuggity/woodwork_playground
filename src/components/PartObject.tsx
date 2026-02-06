import React, { useRef, useMemo, useEffect } from 'react';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { CutCorner, PartData } from '../types';

interface PartObjectProps {
  data: PartData;
  partIndex: number;
  totalParts: number;
  assemblyCenter: [number, number, number];
}

const SELECTION_SUPPRESS_MS = 180;
let suppressSelectionUntil = 0;

const getLCutPoints = (
  width: number,
  depth: number,
  cutWidth: number,
  cutDepth: number,
  corner: CutCorner
): [number, number][] => {
  const minX = -width / 2;
  const maxX = width / 2;
  const minZ = -depth / 2;
  const maxZ = depth / 2;

  switch (corner) {
    case 'front-left':
      return [
        [minX, minZ],
        [maxX, minZ],
        [maxX, maxZ],
        [minX + cutWidth, maxZ],
        [minX + cutWidth, maxZ - cutDepth],
        [minX, maxZ - cutDepth],
      ];
    case 'front-right':
      return [
        [minX, minZ],
        [maxX, minZ],
        [maxX, maxZ - cutDepth],
        [maxX - cutWidth, maxZ - cutDepth],
        [maxX - cutWidth, maxZ],
        [minX, maxZ],
      ];
    case 'back-left':
      return [
        [minX, minZ + cutDepth],
        [minX + cutWidth, minZ + cutDepth],
        [minX + cutWidth, minZ],
        [maxX, minZ],
        [maxX, maxZ],
        [minX, maxZ],
      ];
    case 'back-right':
    default:
      return [
        [minX, minZ],
        [maxX - cutWidth, minZ],
        [maxX - cutWidth, minZ + cutDepth],
        [maxX, minZ + cutDepth],
        [maxX, maxZ],
        [minX, maxZ],
      ];
  }
};

const centerGeometry = (geometry: THREE.BufferGeometry) => {
  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return geometry;

  const center = new THREE.Vector3();
  geometry.boundingBox.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);
  return geometry;
};

const clampCut = (value: number, maxValue: number) => {
  const minValue = Math.min(0.125, maxValue / 2);
  const maxCut = Math.max(minValue, maxValue - minValue);
  return Math.max(minValue, Math.min(value, maxCut));
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

export const PartObject: React.FC<PartObjectProps> = React.memo(({ data, partIndex, totalParts, assemblyCenter }) => {
  const isSelected = useStore((state) => state.selectedId === data.id);
  const isHoveredInSceneList = useStore((state) => state.hoveredId === data.id);
  const tool = useStore((state) => state.tool);
  const snapEnabled = useStore((state) => state.snapEnabled);
  const explodeFactor = useStore((state) => state.explodeFactor);
  const selectPart = useStore((state) => state.selectPart);
  const updatePart = useStore((state) => state.updatePart);

  const explodeGroupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const transformStartRef = useRef<{ position: THREE.Vector3; rotation: THREE.Euler } | null>(null);

  const shouldIgnoreSelection = (button?: number) => {
    if (button !== undefined && button !== 0) {
      return true;
    }
    return Date.now() < suppressSelectionUntil;
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (shouldIgnoreSelection(e.button)) {
      return;
    }
    selectPart(data.id);
  };

  const handleHardwarePointerDown = (e: ThreeEvent<PointerEvent>) => {
    // Reserve this interaction for hardware so nearby wood does not receive it.
    e.stopPropagation();
  };

  const handleHardwareClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (shouldIgnoreSelection(e.button)) {
      return;
    }
    selectPart(data.id);
  };

  const position = useMemo(() => new THREE.Vector3(...data.position), [data.position]);
  const rotation = useMemo(() => new THREE.Euler(...data.rotation), [data.rotation]);
  const [width, height, depth] = data.dimensions;
  const explodeMotion = useMemo(() => {
    const idHash = hashString(data.id);
    const direction = new THREE.Vector3(
      data.position[0] - assemblyCenter[0],
      0,
      data.position[2] - assemblyCenter[2]
    );

    if (direction.lengthSq() < 0.0001) {
      const theta = ((idHash % 360) * Math.PI) / 180;
      direction.set(Math.cos(theta), 0, Math.sin(theta));
    }
    direction.normalize();

    const radialDistance = Math.hypot(
      data.position[0] - assemblyCenter[0],
      data.position[2] - assemblyCenter[2]
    );

    const axis = new THREE.Vector3(
      ((idHash % 17) - 8) / 8,
      (((idHash >> 3) % 19) - 9) / 9,
      (((idHash >> 6) % 23) - 11) / 11
    );
    if (axis.lengthSq() < 0.01) {
      axis.set(0.3, 1, 0.2);
    }
    axis.normalize();

    const spread = 18 + radialDistance * 0.42 + ((partIndex + totalParts) % 6) * 1.6;
    const lift = 8 + (idHash % 7) * 0.85;
    const spin = (1.15 + ((idHash % 9) * 0.17)) * Math.PI;
    const phase = (idHash % 300) / 50;

    return { direction, axis, spread, lift, spin, phase };
  }, [assemblyCenter, data.id, data.position, partIndex, totalParts]);

  const geometry = useMemo<THREE.BufferGeometry>(() => {
    if (data.type === 'hardware') {
      return new THREE.CylinderGeometry(width / 2, width / 2, height, 16);
    }

    if (data.profile?.type === 'l-cut') {
      const cutWidth = clampCut(data.profile.cutWidth ?? width / 2, width);
      const cutDepth = clampCut(data.profile.cutDepth ?? depth / 2, depth);
      const corner = data.profile.corner ?? 'front-left';
      const points = getLCutPoints(width, depth, cutWidth, cutDepth, corner);

      const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
      const extruded = new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 1,
      });

      extruded.rotateX(-Math.PI / 2);
      return centerGeometry(extruded);
    }

    if (data.profile?.type === 'polygon' && data.profile.points && data.profile.points.length >= 3) {
      const shape = new THREE.Shape(data.profile.points.map(([x, z]) => new THREE.Vector2(x, z)));
      const extruded = new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 1,
      });

      extruded.rotateX(-Math.PI / 2);
      return centerGeometry(extruded);
    }

    return new THREE.BoxGeometry(width, height, depth);
  }, [data.type, data.profile, width, height, depth]);

  const edgeGeometry = useMemo(() => {
    if (data.type === 'hardware') {
      return null;
    }
    if (data.profile?.type === 'polygon' && data.profile.points && data.profile.points.length > 48) {
      return null;
    }
    return new THREE.EdgesGeometry(geometry);
  }, [data.type, geometry]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    return () => {
      edgeGeometry?.dispose();
    };
  }, [edgeGeometry]);

  useFrame(({ clock }, delta) => {
    const explodeGroup = explodeGroupRef.current;
    if (explodeGroup) {
      const pulse = Math.sin(clock.elapsedTime * 3.2 + explodeMotion.phase) * explodeFactor * 0.35;
      const targetX = explodeMotion.direction.x * explodeMotion.spread * explodeFactor;
      const targetY = (explodeMotion.lift + pulse) * explodeFactor;
      const targetZ = explodeMotion.direction.z * explodeMotion.spread * explodeFactor;

      explodeGroup.position.x = THREE.MathUtils.damp(explodeGroup.position.x, targetX, 8, delta);
      explodeGroup.position.y = THREE.MathUtils.damp(explodeGroup.position.y, targetY, 8, delta);
      explodeGroup.position.z = THREE.MathUtils.damp(explodeGroup.position.z, targetZ, 8, delta);

      const targetRotX = explodeMotion.axis.x * explodeMotion.spin * explodeFactor;
      const targetRotY = explodeMotion.axis.y * explodeMotion.spin * explodeFactor;
      const targetRotZ = explodeMotion.axis.z * explodeMotion.spin * explodeFactor;
      explodeGroup.rotation.x = THREE.MathUtils.damp(explodeGroup.rotation.x, targetRotX, 6.5, delta);
      explodeGroup.rotation.y = THREE.MathUtils.damp(explodeGroup.rotation.y, targetRotY, 6.5, delta);
      explodeGroup.rotation.z = THREE.MathUtils.damp(explodeGroup.rotation.z, targetRotZ, 6.5, delta);
    }

    const material = materialRef.current;
    if (!material) return;

    if (isHoveredInSceneList) {
      material.emissive.set('#16a34a');
      material.emissiveIntensity = 0.3 + (Math.sin(clock.elapsedTime * 9) + 1) * 0.25;
      return;
    }

    material.emissive.set('#000000');
    material.emissiveIntensity = 0;
  });

  const onTransformStart = () => {
    if (!meshRef.current) return;

    transformStartRef.current = {
      position: meshRef.current.position.clone(),
      rotation: meshRef.current.rotation.clone(),
    };
  };

  const onTransformEnd = () => {
    if (meshRef.current) {
      const newPos = meshRef.current.position;
      const newRot = meshRef.current.rotation;
      const start = transformStartRef.current;

      if (start) {
        const moved = newPos.distanceTo(start.position) > 0.0001;
        const rotated =
          Math.abs(newRot.x - start.rotation.x) > 0.0001 ||
          Math.abs(newRot.y - start.rotation.y) > 0.0001 ||
          Math.abs(newRot.z - start.rotation.z) > 0.0001;

        if (moved || rotated) {
          suppressSelectionUntil = Date.now() + SELECTION_SUPPRESS_MS;
        }
      }
      transformStartRef.current = null;

      updatePart(data.id, {
        position: [newPos.x, newPos.y, newPos.z],
        rotation: [newRot.x, newRot.y, newRot.z],
      });
    }
  };

  const showTransform = explodeFactor < 0.001 && isSelected && (tool === 'move' || tool === 'rotate');
  const mode = tool === 'rotate' ? 'rotate' : 'translate';
  const fillColor = isHoveredInSceneList ? '#4ade80' : isSelected ? '#ff9f43' : (data.color || '#eecfa1');
  const strokeColor = isHoveredInSceneList ? '#22c55e' : isSelected ? '#ff6b6b' : '#8d6e63';
  const hardwareHitRadius = Math.max(width * 3, 0.45);
  const hardwareHitHeight = Math.max(height + 0.75, 2.5);

  return (
    <>
      {showTransform && (
        <TransformControls
          object={meshRef as unknown as React.MutableRefObject<THREE.Object3D>}
          mode={mode}
          onMouseDown={onTransformStart}
          onMouseUp={onTransformEnd}
          translationSnap={snapEnabled ? 0.125 : undefined}
          rotationSnap={snapEnabled ? Math.PI / 8 : undefined}
        />
      )}
      <group ref={explodeGroupRef}>
        <mesh
          ref={meshRef}
          position={position}
          rotation={rotation}
          onClick={data.type === 'hardware' ? undefined : handleClick}
          castShadow
          receiveShadow
        >
          <primitive object={geometry} attach="geometry" />
          <meshStandardMaterial
            ref={materialRef}
            color={fillColor}
            roughness={data.type === 'hardware' ? 0.3 : 0.8}
            metalness={data.type === 'hardware' ? 0.8 : 0.1}
          />
          {data.type === 'hardware' && (
            <mesh onPointerDown={handleHardwarePointerDown} onClick={handleHardwareClick}>
              <cylinderGeometry args={[hardwareHitRadius, hardwareHitRadius, hardwareHitHeight, 20]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}
          {data.type !== 'hardware' && edgeGeometry && (
            <lineSegments>
              <primitive object={edgeGeometry} attach="geometry" />
              <lineBasicMaterial color={strokeColor} />
            </lineSegments>
          )}
        </mesh>
      </group>
    </>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.data === nextProps.data
    && prevProps.partIndex === nextProps.partIndex
    && prevProps.totalParts === nextProps.totalParts
    && prevProps.assemblyCenter[0] === nextProps.assemblyCenter[0]
    && prevProps.assemblyCenter[1] === nextProps.assemblyCenter[1]
    && prevProps.assemblyCenter[2] === nextProps.assemblyCenter[2]
  );
});
