import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function useVideoTexture(stream: MediaStream | null): THREE.VideoTexture | null {
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Update texture on every frame when video is playing
  useFrame(() => {
    if (texture && videoRef.current && videoRef.current.readyState >= videoRef.current.HAVE_CURRENT_DATA) {
      texture.needsUpdate = true;
    }
  });

  useEffect(() => {
    console.log('useVideoTexture: Stream changed', stream ? 'Stream received' : 'No stream');
    
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
    video.loop = true;
    video.style.display = 'none'; // Hide from DOM but keep functional
    document.body.appendChild(video); // Add to DOM to ensure proper video loading
    videoRef.current = video;

    // Create texture once video can play
    const handleCanPlay = () => {
      console.log('Video can play, creating texture. Video dimensions:', video.videoWidth, 'x', video.videoHeight);
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.format = THREE.RGBAFormat;
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.generateMipmaps = false;
      videoTexture.flipY = true; // Try flipping Y to fix upside-down video
      videoTexture.wrapS = THREE.ClampToEdgeWrapping;
      videoTexture.wrapT = THREE.ClampToEdgeWrapping;
      
      // Store aspect ratio for proper scaling
      videoTexture.userData = {
        aspectRatio: video.videoWidth / video.videoHeight,
        originalWidth: video.videoWidth,
        originalHeight: video.videoHeight
      };
      
      console.log('Video aspect ratio:', videoTexture.userData.aspectRatio);
      console.log('Video flipY setting:', videoTexture.flipY);
      setTexture(videoTexture);
    };

    video.addEventListener('canplay', handleCanPlay);

    // Start playing the video
    video.play().then(() => {
      console.log('Video started playing successfully');
    }).catch(error => {
      console.error('Error playing video for texture:', error);
    });

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      if (texture) {
        texture.dispose();
      }
      if (video) {
        video.srcObject = null;
        if (video.parentNode) {
          video.parentNode.removeChild(video); // Remove from DOM
        }
      }
    };
  }, [stream]);

  return texture;
}

export default useVideoTexture; 