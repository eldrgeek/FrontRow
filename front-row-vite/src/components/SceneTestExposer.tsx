import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * Test component that exposes the R3F scene to the global window for testing
 * This allows e2e tests to access Three.js objects directly
 */
function SceneTestExposer(): JSX.Element | null {
  const { scene, camera, gl } = useThree();

  useEffect(() => {
    // Expose scene for testing in development mode only
    const isDevelopment = import.meta.env.MODE === 'development';
    const isTestMode = import.meta.env.VITE_ENABLE_TEST_MODE === 'true';
    
    if (isDevelopment || isTestMode) {
      (window as any).__FRONTROW_SCENE__ = {
        scene,
        camera,
        renderer: gl,
        
        // Helper functions for testing
        getSeatByName: (seatId: string) => {
          return scene.getObjectByName(seatId);
        },
        
        getAllSeats: () => {
          const seats: any[] = [];
          scene.traverse((obj) => {
            if (obj.name.startsWith('seat-')) {
              seats.push(obj);
            }
          });
          return seats;
        },
        
        clickSeat: (seatId: string) => {
          const seat = scene.getObjectByName(seatId);
          if (seat) {
            // Look for the click handler in the seat's children (specifically the interactive group)
            for (const child of seat.children) {
              if (child.userData && child.userData.onClick) {
                child.userData.onClick();
                return `Clicked seat ${seatId}`;
              }
            }
            return `Seat ${seatId} found but no click handler`;
          }
          return `Seat ${seatId} not found`;
        },
        
        listAllObjects: () => {
          const objects: string[] = [];
          scene.traverse((obj) => {
            if (obj.name) {
              objects.push(obj.name);
            }
          });
          return objects;
        }
      };
      
      console.log('🧪 Scene exposed for testing:', (window as any).__FRONTROW_SCENE__);
    }
  }, [scene, camera, gl]);

  return null; // This component doesn't render anything
}

export default SceneTestExposer;