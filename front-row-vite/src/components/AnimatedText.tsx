import React, { useRef, useState, useEffect } from 'react';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface AnimatedTextProps {
  text: string;
  position: [number, number, number];
  fontSize?: number;
  color?: string;
  duration?: number; // Duration to show text in seconds
  onComplete?: () => void;
}

function AnimatedText({ text, position, fontSize = 0.8, color = "white", duration = 3, onComplete }: AnimatedTextProps): JSX.Element {
  const textRef = useRef<THREE.Mesh>(null);
  const [opacity, setOpacity] = useState(0);
  const [scale, setScale] = useState(0.5);
  const startTime = useRef<number>(Date.now());
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Reset start time when component mounts to ensure fresh animation
    startTime.current = Date.now();
    setOpacity(0);
    setScale(0.5);
    setIsVisible(true);
  }, [text]);

  useFrame(() => {
    if (!isVisible) return;
    
    const elapsed = (Date.now() - startTime.current) / 1000;
    
    if (elapsed < 0.5) {
      // Fly in animation (0-0.5s)
      const progress = elapsed / 0.5;
      setOpacity(progress);
      setScale(0.5 + progress * 0.5);
    } else if (elapsed < duration - 0.5) {
      // Hold at full visibility
      setOpacity(1);
      setScale(1);
    } else if (elapsed < duration) {
      // Fly out animation (last 0.5s)
      const progress = (duration - elapsed) / 0.5;
      setOpacity(progress);
      setScale(1 + (1 - progress) * 0.2);
    } else {
      // Animation complete
      setIsVisible(false);
      if (onComplete) {
        onComplete();
      }
    }
  });

  if (!isVisible) return <></>;

  return (
    <Text
      ref={textRef}
      position={position}
      fontSize={fontSize}
      color={color}
      anchorX="center"
      anchorY="middle"
      scale={[scale, scale, scale]}
    >
      <meshBasicMaterial 
        attach="material" 
        color={color} 
        transparent={true} 
        opacity={opacity}
      />
      {text}
    </Text>
  );
}

export default AnimatedText;