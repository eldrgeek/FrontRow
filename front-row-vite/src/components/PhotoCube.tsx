import React, { useRef, useEffect } from 'react';
import { Box } from '@react-three/drei';
import * as THREE from 'three';

interface PhotoCubeProps {
  imageUrl?: string;
  position: [number, number, number];
  size?: number;
  color?: string;
  opacity?: number;
}

function PhotoCube({ imageUrl, position, size = 1, color = 'blue', opacity = 0.9 }: PhotoCubeProps): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  useEffect(() => {
    if (imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageUrl;
      
      img.onload = () => {
        // Create texture from image
        textureRef.current = new THREE.Texture(img);
        textureRef.current.needsUpdate = true;
        
        // Create 6 materials (one for each face of the cube)
        materialsRef.current = Array(6).fill(null).map(() => new THREE.MeshStandardMaterial({
          map: textureRef.current,
          transparent: true,
          opacity: opacity
        }));
        
        // Apply materials to the mesh
        if (meshRef.current) {
          meshRef.current.material = materialsRef.current;
        }
      };
      
      img.onerror = () => {
        console.error('Failed to load image for PhotoCube:', imageUrl);
        // Fallback to solid color
        createSolidColorMaterials();
      };
    } else {
      createSolidColorMaterials();
    }
  }, [imageUrl, color, opacity]);

  const createSolidColorMaterials = () => {
    materialsRef.current = Array(6).fill(null).map(() => new THREE.MeshStandardMaterial({
      color: color,
      transparent: true,
      opacity: opacity
    }));
    
    if (meshRef.current) {
      meshRef.current.material = materialsRef.current;
    }
  };

  return (
    <Box
      ref={meshRef}
      args={[size, size, size]}
      position={position}
      castShadow
      receiveShadow
    />
  );
}

export default PhotoCube;