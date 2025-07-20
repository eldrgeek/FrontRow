import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export function useVideoTexture(stream: MediaStream | null): THREE.VideoTexture | null {
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!stream) {
      // Clean up existing texture
      if (texture) {
        texture.dispose();
        setTexture(null);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current = null;
      }
      return;
    }

    // Create video element
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true; // Mute to avoid echo
    video.playsInline = true;
    video.autoplay = true;
    videoRef.current = video;

    // Create texture once video can play
    const handleCanPlay = () => {
      console.log('Video can play, creating texture. Video dimensions:', video.videoWidth, 'x', video.videoHeight);
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.format = THREE.RGBAFormat;
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.generateMipmaps = false;
      videoTexture.flipY = true; // Flip Y to correct video orientation
      videoTexture.wrapS = THREE.ClampToEdgeWrapping;
      videoTexture.wrapT = THREE.ClampToEdgeWrapping;
      setTexture(videoTexture);
    };

    video.addEventListener('canplay', handleCanPlay);

    // Start playing the video
    video.play().catch(error => {
      console.error('Error playing video for texture:', error);
    });

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      if (texture) {
        texture.dispose();
      }
      if (video) {
        video.srcObject = null;
      }
    };
  }, [stream]);

  return texture;
}

export default useVideoTexture; 