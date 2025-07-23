import React, { useRef, useEffect } from 'react';
import { Box } from '@react-three/drei';
import * as THREE from 'three';

interface PhotoCubeProps {
  imageUrl?: string;
  videoStream?: MediaStream;
  captureMode?: 'photo' | 'video';
  position: [number, number, number];
  size?: number;
  color?: string;
  opacity?: number;
}

function PhotoCube({ imageUrl, videoStream, captureMode = 'photo', position, size = 1, color = 'blue', opacity = 0.9 }: PhotoCubeProps): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (captureMode === 'video' && videoStream) {
      // Video mode
      if (!videoRef.current) {
        videoRef.current = document.createElement('video');
        videoRef.current.autoplay = true;
        videoRef.current.playsInline = true;
        videoRef.current.muted = true;
        videoRef.current.loop = true;
      }
      
      const video = videoRef.current;
      video.srcObject = videoStream;
      
      video.onloadedmetadata = () => {
        video.play();
        
        // Create video texture
        textureRef.current = new THREE.VideoTexture(video);
        textureRef.current.minFilter = THREE.LinearFilter;
        textureRef.current.magFilter = THREE.LinearFilter;
        textureRef.current.format = THREE.RGBAFormat;
        
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
      
    } else if (captureMode === 'photo' && imageUrl) {
      // Photo mode
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
    
    // Cleanup function
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    };
  }, [imageUrl, videoStream, captureMode, color, opacity]);

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