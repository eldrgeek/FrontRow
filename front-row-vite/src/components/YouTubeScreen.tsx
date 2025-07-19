import React, { useRef, useEffect } from 'react';
import { Html } from '@react-three/drei';

interface YouTubeScreenProps {
  videoId: string;
  position?: [number, number, number];
  isLive?: boolean;
}

function YouTubeScreen({ videoId, position = [0, 3, -8], isLive = false }: YouTubeScreenProps): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Auto-play the video when component mounts (if allowed by browser)
    if (iframeRef.current && isLive) {
      console.log('YouTube video loaded:', videoId);
    }
  }, [videoId, isLive]);

  // Extract video ID from YouTube URL if full URL is provided
  const getVideoId = (url: string): string => {
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : url;
  };

  const cleanVideoId = getVideoId(videoId);
  const embedUrl = `https://www.youtube.com/embed/${cleanVideoId}?autoplay=1&mute=0&loop=1&playlist=${cleanVideoId}&controls=1&showinfo=0&rel=0&modestbranding=1`;

  return (
    <Html
      position={position}
      transform
      occlude="blending"
      style={{
        width: '800px',
        height: '450px',
        pointerEvents: 'none', // Prevent interference with 3D controls
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: '0 0 20px rgba(0,0,0,0.5)',
          background: '#000'
        }}
      >
        <iframe
          ref={iframeRef}
          width="100%"
          height="100%"
          src={embedUrl}
          title="YouTube Performance"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{
            border: 'none',
            borderRadius: '10px'
          }}
        />
      </div>
    </Html>
  );
}

export default YouTubeScreen; 