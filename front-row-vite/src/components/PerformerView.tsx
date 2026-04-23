import React, { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { OrbitControls } from 'three-stdlib';

interface PerformerViewProps {
  localStream?: MediaStream | null;
}

function PerformerView({ localStream }: PerformerViewProps): JSX.Element {
  const { camera, controls } = useThree();
  const initialized = useRef(false);

  // Set camera to a good "from-the-stage" angle once on mount,
  // then let OrbitControls take over freely (no useFrame override).
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Position: slightly above & behind center stage, looking out at the audience
    camera.position.set(0, 4, -6);

    const isOrbit = (ctrl: any): ctrl is OrbitControls =>
      ctrl && typeof ctrl.target !== 'undefined' && typeof ctrl.update === 'function';

    if (isOrbit(controls)) {
      controls.target.set(0, 1.5, 4); // Look toward mid-audience
      controls.update();
    } else {
      camera.lookAt(0, 1.5, 4);
    }
  }, [camera, controls]);

  return (
    <>
      {/* Local video preview — floated in 3D scene as a small monitor */}
      {localStream && (
        <Html
          position={[-9, 1, 5]}
          transform
          occlude="blending"
          style={{
            width: '220px',
            height: '140px',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '10px',
              overflow: 'hidden',
              boxShadow: '0 0 20px rgba(0,0,0,0.8)',
              background: '#000',
              border: '2px solid #ffd700',
              position: 'relative',
            }}
          >
            <video
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
              }}
              autoPlay
              muted
              playsInline
              ref={(video) => {
                if (video && localStream) video.srcObject = localStream;
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '5px',
                left: '5px',
                background: 'rgba(0,0,0,0.7)',
                color: 'white',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            >
              YOU (monitor)
            </div>
          </div>
        </Html>
      )}
    </>
  );
}

export default PerformerView;
