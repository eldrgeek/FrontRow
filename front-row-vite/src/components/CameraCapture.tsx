import React, { useRef, useState, useCallback } from 'react';

interface CameraCaptureProps {
  onPhotoCapture: (photoDataUrl: string) => void;
  onCancel: () => void;
}

function CameraCapture({ onPhotoCapture, onCancel }: CameraCaptureProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      console.log('Requesting camera access...');
      
      // Check if user is in artist mode (camera might already be in use)
      const isArtist = sessionStorage.getItem('frontrow_is_artist') === 'true';
      if (isArtist) {
        console.warn('User is in artist mode - camera might be in use for streaming');
      }
      
      // Request camera access with user-facing camera preference
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user', // Front camera
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
      
      console.log('Camera access granted, stream received:', mediaStream);
      setStream(mediaStream);
      
      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = mediaStream;
        
        // Wait for video metadata to load before showing controls
        const handleLoadedMetadata = () => {
          console.log('Video metadata loaded, dimensions:', video.videoWidth, 'x', video.videoHeight);
          console.log('Video element size:', video.offsetWidth, 'x', video.offsetHeight);
          setIsStreamActive(true);
          video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        };
        
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        
        // Fallback timeout in case loadedmetadata doesn't fire
        setTimeout(() => {
          if (!isStreamActive) {
            console.log('Fallback: Setting stream active after timeout');
            setIsStreamActive(true);
          }
        }, 1000);
        
        try {
          await video.play();
          console.log('Video play started');
        } catch (playError) {
          console.error('Error playing video:', playError);
          // Still try to show controls even if play fails
          setIsStreamActive(true);
        }
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      
      // Check for specific error types
      if (err instanceof DOMException) {
        switch (err.name) {
          case 'NotAllowedError':
            setError('Camera permission denied. Please allow camera access and try again.');
            break;
          case 'NotFoundError':
            setError('No camera found on this device.');
            break;
          case 'NotReadableError':
            setError('Camera is already in use by another application. Please close other apps using the camera and try again.');
            break;
          case 'OverconstrainedError':
            setError('Camera constraints cannot be satisfied. Trying with basic settings...');
            // Retry with minimal constraints
            try {
              const basicStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
              });
              setStream(basicStream);
              if (videoRef.current) {
                videoRef.current.srcObject = basicStream;
                await videoRef.current.play();
                setIsStreamActive(true);
              }
              setError(null);
            } catch (retryErr) {
              setError('Unable to access camera even with basic settings.');
            }
            break;
          default:
            setError(`Camera error: ${err.message}`);
        }
      } else {
        setError('Unable to access camera. Please make sure camera permissions are granted.');
      }
    }
  }, [isStreamActive]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsStreamActive(false);
  }, [stream]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) return;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame to canvas
    context.drawImage(video, 0, 0);
    
    // Convert to data URL (base64)
    const photoDataUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    // Store in session storage
    sessionStorage.setItem('frontrow_user_image', photoDataUrl);
    
    // Stop camera and return photo
    stopCamera();
    onPhotoCapture(photoDataUrl);
  }, [stopCamera, onPhotoCapture]);

  const handleCancel = useCallback(() => {
    stopCamera();
    onCancel();
  }, [stopCamera, onCancel]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="camera-capture-modal">
      <div className="camera-capture-content">
        <h3>Take Your Photo</h3>
        <p style={{ fontSize: '12px', opacity: 0.7 }}>
          Debug: Stream: {stream ? 'Yes' : 'No'}, Active: {isStreamActive ? 'Yes' : 'No'}
        </p>
        
        {error && (
          <div className="error-message">
            <p>{error}</p>
            <button onClick={handleCancel} className="cancel-btn">Close</button>
          </div>
        )}
        
        {!isStreamActive && !error && (
          <div className="camera-start">
            <p>Ready to take your photo?</p>
            <div className="camera-buttons">
              <button onClick={startCamera} className="start-camera-btn">
                📷 Start Camera
              </button>
              <button onClick={handleCancel} className="cancel-btn">
                Cancel
              </button>
            </div>
          </div>
        )}
        
        {isStreamActive && (
          <div className="camera-active">
            <div className="video-container">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-video"
                style={{ display: 'block', backgroundColor: '#333' }}
                onError={(e) => console.error('Video error:', e)}
                onLoadStart={() => console.log('Video load started')}
                onCanPlay={() => console.log('Video can play')}
              />
            </div>
            <div className="camera-controls">
              <button onClick={capturePhoto} className="capture-btn">
                📸 Capture Photo
              </button>
              <button onClick={handleCancel} className="cancel-btn">
                Cancel
              </button>
            </div>
          </div>
        )}
        
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
      
      <style>{`
        .camera-capture-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        
        .camera-capture-content {
          background: #1a1a1a;
          border-radius: 10px;
          padding: 20px;
          max-width: 90vw;
          max-height: 90vh;
          text-align: center;
          color: white;
        }
        
        .camera-capture-content h3 {
          margin: 0 0 20px 0;
          color: #ffd700;
        }
        
        .error-message {
          color: #ff6b6b;
          margin: 20px 0;
        }
        
        .camera-start {
          padding: 20px 0;
        }
        
        .camera-buttons, .camera-controls {
          display: flex;
          gap: 15px;
          justify-content: center;
          margin-top: 20px;
        }
        
        .video-container {
          margin-bottom: 20px;
        }
        
        .camera-video {
          width: 100%;
          max-width: 400px;
          height: auto;
          border-radius: 8px;
          transform: scaleX(-1); /* Mirror the video for selfie mode */
        }
        
        .start-camera-btn, .capture-btn {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          transition: background-color 0.3s;
        }
        
        .start-camera-btn:hover, .capture-btn:hover {
          background: #45a049;
        }
        
        .cancel-btn {
          background: #f44336;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          transition: background-color 0.3s;
        }
        
        .cancel-btn:hover {
          background: #da190b;
        }
        
        @media (max-width: 768px) {
          .camera-capture-content {
            padding: 15px;
          }
          
          .camera-video {
            max-width: 100%;
          }
          
          .camera-buttons, .camera-controls {
            flex-direction: column;
            align-items: center;
          }
        }
      `}</style>
    </div>
  );
}

export default CameraCapture;