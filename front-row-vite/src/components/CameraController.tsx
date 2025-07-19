import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from 'three-stdlib';
import * as THREE from 'three';

interface CameraControllerProps {
  currentView: 'eye-in-the-sky' | 'performer' | 'user';
  selectedSeat: string | null;
  savedPositions: {
    'eye-in-the-sky': { position: [number, number, number]; target: [number, number, number] };
    'user': { position: [number, number, number]; target: [number, number, number] };
  };
  onPositionChange: (view: 'eye-in-the-sky' | 'user', position: [number, number, number], target: [number, number, number]) => void;
}

interface SeatData {
  id: string;
  position: [number, number, number];
}

function CameraController({ currentView, selectedSeat, savedPositions, onPositionChange }: CameraControllerProps): JSX.Element {
  const { camera, controls } = useThree();
  const targetRef = useRef(new THREE.Vector3());
  const positionRef = useRef(new THREE.Vector3());
  const isTransitioning = useRef(false);
  const lastView = useRef(currentView);
  const lastSeatRef = useRef<string | null>(selectedSeat);
  const transitionProgress = useRef(0);
  const transitionDuration = 0.7; // seconds
  const startPosRef = useRef(new THREE.Vector3());
  const startTargetRef = useRef(new THREE.Vector3());
  const targetPosRef = useRef(new THREE.Vector3());
  const targetLookRef = useRef(new THREE.Vector3());

  const beginTransition = (endPos: THREE.Vector3, endTarget: THREE.Vector3) => {
    startPosRef.current.copy(camera.position);
    if (isOrbitControls(controls)) startTargetRef.current.copy(controls.target);
    targetPosRef.current.copy(endPos);
    targetLookRef.current.copy(endTarget);
    transitionProgress.current = 0;
    isTransitioning.current = true;
  };

  // Type guard to check if controls are OrbitControls
  const isOrbitControls = (ctrl: any): ctrl is OrbitControls => {
    return ctrl && typeof ctrl.target !== 'undefined' && typeof ctrl.update === 'function';
  };

  // Generate seat positions (same logic as SeatSelection)
  const getSeatsData = (): SeatData[] => {
    const seatsData: SeatData[] = [];
    const frontRowRadius = 10; // Increased radius for better spacing
    const stageZOffset = -8;
    const startAngle = 0; // Start from front (0 degrees)
    const endAngle = Math.PI; // End at back (180 degrees)
    const totalSeats = 9;

    for (let i = 0; i < totalSeats; i++) {
      const angle = startAngle + (i / (totalSeats - 1)) * (endAngle - startAngle);
      const x = frontRowRadius * Math.cos(angle);
      const z = frontRowRadius * Math.sin(angle) + stageZOffset; // Align with stage
      seatsData.push({ id: `seat-${i}`, position: [x, 0.5, z] });
    }
    return seatsData;
  };

  // Update camera position when view changes
  // Handle custom camera control events
  useEffect(() => {
    const handleCameraEvents = (event: Event) => {
      if (!isOrbitControls(controls)) return;
      
      const eventType = event.type;
      const zoomSpeed = 2;
      const rotateSpeed = 0.2;
      
      switch (eventType) {
        case 'camera-zoom-in':
          camera.position.multiplyScalar(0.9);
          break;
        case 'camera-zoom-out':
          camera.position.multiplyScalar(1.1);
          break;
        case 'camera-rotate-left':
          // Rotate camera around target
          camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotateSpeed);
          break;
        case 'camera-rotate-right':
          camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -rotateSpeed);
          break;
        case 'camera-rotate-up':
          camera.position.y += 1;
          break;
        case 'camera-rotate-down':
          camera.position.y -= 1;
          break;
        case 'camera-reset':
          if (currentView === 'eye-in-the-sky') {
            positionRef.current.set(...savedPositions['eye-in-the-sky'].position);
            targetRef.current.set(...savedPositions['eye-in-the-sky'].target);
          } else if (currentView === 'user' && selectedSeat) {
            const seatsData = getSeatsData();
            const currentSeat = seatsData.find(s => s.id === selectedSeat);
            if (currentSeat) {
              positionRef.current.set(
                currentSeat.position[0],
                currentSeat.position[1] + 1.2,
                currentSeat.position[2] + 0.5
              );
              targetRef.current.set(0, 3, -10);
            }
          }
          beginTransition(positionRef.current, targetRef.current);
          break;
      }
      
      controls.update();
    };

    // Add event listeners
    window.addEventListener('camera-zoom-in', handleCameraEvents);
    window.addEventListener('camera-zoom-out', handleCameraEvents);
    window.addEventListener('camera-rotate-left', handleCameraEvents);
    window.addEventListener('camera-rotate-right', handleCameraEvents);
    window.addEventListener('camera-rotate-up', handleCameraEvents);
    window.addEventListener('camera-rotate-down', handleCameraEvents);
    window.addEventListener('camera-reset', handleCameraEvents);

    return () => {
      // Cleanup event listeners
      window.removeEventListener('camera-zoom-in', handleCameraEvents);
      window.removeEventListener('camera-zoom-out', handleCameraEvents);
      window.removeEventListener('camera-rotate-left', handleCameraEvents);
      window.removeEventListener('camera-rotate-right', handleCameraEvents);
      window.removeEventListener('camera-rotate-up', handleCameraEvents);
      window.removeEventListener('camera-rotate-down', handleCameraEvents);
      window.removeEventListener('camera-reset', handleCameraEvents);
    };
  }, [controls, currentView, selectedSeat, savedPositions]);

  useEffect(() => {
    if (lastView.current !== currentView) {
      // Save current position before switching
      if (isOrbitControls(controls)) {
        const currentPosition: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
        const currentTarget: [number, number, number] = [controls.target.x, controls.target.y, controls.target.z];
        
        if (lastView.current === 'eye-in-the-sky' || lastView.current === 'user') {
          onPositionChange(lastView.current, currentPosition, currentTarget);
        }
      }

      // Set new position based on view
      let newPosition: [number, number, number];
      let newTarget: [number, number, number];

      if (currentView === 'eye-in-the-sky') {
        newPosition = savedPositions['eye-in-the-sky'].position;
        newTarget = savedPositions['eye-in-the-sky'].target;
      } else if (currentView === 'user' && selectedSeat) {
        const seatsData = getSeatsData();
        const currentSeat = seatsData.find(s => s.id === selectedSeat);
        if (currentSeat) {
          newPosition = [
            currentSeat.position[0],
            currentSeat.position[1] + 1.2,
            currentSeat.position[2] + 0.5
          ];
          newTarget = [0, 3, -10]; // Look at performer video screen at back of stage
        } else {
          newPosition = savedPositions['user'].position;
          newTarget = savedPositions['user'].target;
        }
      } else {
        newPosition = savedPositions['eye-in-the-sky'].position;
        newTarget = savedPositions['eye-in-the-sky'].target;
      }

      // Smooth transition to new position
      beginTransition(new THREE.Vector3(...newPosition), new THREE.Vector3(...newTarget));

      lastView.current = currentView;
    }
  }, [currentView, selectedSeat, savedPositions, camera, controls, onPositionChange]);

  // Detect selectedSeat change within 'user' view and initiate smooth move
  useEffect(() => {
    if (currentView === 'user' && selectedSeat && selectedSeat !== lastSeatRef.current) {
      const seatsData = getSeatsData();
      const newSeat = seatsData.find(s => s.id === selectedSeat);
      if (newSeat) {
        positionRef.current.set(newSeat.position[0], newSeat.position[1] + 1.2, newSeat.position[2] + 0.5);
        targetRef.current.set(0, 3, -10);
        beginTransition(positionRef.current, targetRef.current);
        lastSeatRef.current = selectedSeat;
      }
    }
  }, [selectedSeat, currentView]);

  useFrame(() => {
    if (isTransitioning.current && isOrbitControls(controls)) {
       const dt = 1/60;
       transitionProgress.current += dt/transitionDuration;
       const t = Math.min(transitionProgress.current,1);
       camera.position.lerpVectors(startPosRef.current, targetPosRef.current, t);
       controls.target.lerpVectors(startTargetRef.current, targetLookRef.current, t);
       if(t>=1){isTransitioning.current=false;}
       controls.update();
    }
  });

  return null; // This component doesn't render anything visual
}

export default CameraController; 