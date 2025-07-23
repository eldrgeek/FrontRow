import React, { useRef, useState, useCallback } from 'react';

interface CameraCaptureProps {
  onPhotoCapture: (photoDataUrl: string) => void;
  onVideoStream: (stream: MediaStream) => void;
  onCancel: () => void;
}

function CameraCapture({ onPhotoCapture, onVideoStream, onCancel }: CameraCaptureProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [captureMode, setCaptureMode] = useState<'choice' | 'photo' | 'video'>('choice');
  
  // Debug logging for state changes
  React.useEffect(() => {
    console.log('🎥 showVideo changed to:', showVideo);
  }, [showVideo]);
  
  React.useEffect(() => {
    console.log('📹 isStreamActive changed to:', isStreamActive);
  }, [isStreamActive]);
  
  React.useEffect(() => {
    console.log('🔴 stream changed to:', stream ? 'MediaStream present' : 'No stream');
  }, [stream]);
  
  React.useEffect(() => {
    console.log('❌ error changed to:', error);
  }, [error]);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      console.log('Requesting camera access...');
      
      // Check if user is in artist mode (camera might already be in use)
      const isArtist = sessionStorage.getItem('frontrow_is_artist') === 'true';
      if (isArtist) {
        console.warn('User is in artist mode - camera might be in use for streaming');
      }
      
      // Show video element first so it exists when we assign the stream
      setShowVideo(true);
      
      // Wait a bit for React to render the video element
      await new Promise(resolve => setTimeout(resolve, 100));
      
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
        console.log('Video element found, assigning stream...');
        console.log('Video element dimensions before:', video.offsetWidth, 'x', video.offsetHeight);
        
        video.srcObject = mediaStream;
        console.log('Stream assigned to video element');
        
        // Wait for video metadata to load before showing controls
        const handleLoadedMetadata = () => {
          console.log('✓ Video metadata loaded!');
          console.log('Video dimensions:', video.videoWidth, 'x', video.videoHeight);
          console.log('Video element size:', video.offsetWidth, 'x', video.offsetHeight);
          console.log('Video readyState:', video.readyState);
          
          // Delay setting active to avoid interrupting video play
          setTimeout(() => {
            setIsStreamActive(true);
          }, 100);
          
          video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        };
        
        const handleCanPlay = () => {
          console.log('✓ Video can play event fired');
          if (!isStreamActive) {
            console.log('Setting stream active from canplay event');
            // Delay setting active to avoid interrupting video play
            setTimeout(() => {
              setIsStreamActive(true);
            }, 100);
          }
          video.removeEventListener('canplay', handleCanPlay);
        };
        
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('canplay', handleCanPlay);
        
        // Fallback timeout
        setTimeout(() => {
          console.log('Timeout fallback triggered');
          console.log('Video readyState at timeout:', video.readyState);
          console.log('Video dimensions at timeout:', video.videoWidth, 'x', video.videoHeight);
          if (!isStreamActive) {
            console.log('Force setting stream active after timeout');
            setIsStreamActive(true);
          }
        }, 2000); // Increased timeout to give video more time
        
        try {
          console.log('Attempting to play video...');
          await video.play();
          console.log('✓ Video play started successfully');
        } catch (playError) {
          console.error('Error playing video:', playError);
          console.log('Play failed but still showing controls');
          // Don't set error here - just log it and continue
          // Still try to show controls even if play fails, but delay it
          setTimeout(() => {
            setIsStreamActive(true);
          }, 100);
        }
      } else {
        console.error('Video element not found!');
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
  }, []); // Remove isStreamActive dependency to prevent re-renders

  const stopCamera = useCallback(() => {
    console.log('🛑 stopCamera called');
    if (stream) {
      console.log('🛑 Stopping stream tracks');
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsStreamActive(false);
    setShowVideo(false);
  }, []); // Remove stream dependency to prevent re-renders

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
    sessionStorage.setItem('frontrow_capture_mode', 'photo');
    
    // Stop camera and return photo
    stopCamera();
    onPhotoCapture(photoDataUrl);
  }, [stopCamera, onPhotoCapture]);

  const startVideoStream = useCallback(() => {
    if (!stream) return;
    
    // Store capture mode for reconnection purposes
    sessionStorage.setItem('frontrow_capture_mode', 'video');
    
    // Don't stop camera - keep stream active for video mode
    onVideoStream(stream);
  }, [stream, onVideoStream]);

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
        
        {captureMode === 'choice' && !error && (
          <div className="capture-choice">
            <p>How would you like to appear to other participants?</p>
            <div className="choice-buttons">
              <button 
                onClick={() => setCaptureMode('photo')} 
                className="choice-btn photo-btn"
              >
                📷 Take a Photo
                <small>Static image on your seat</small>
              </button>
              <button 
                onClick={() => setCaptureMode('video')} 
                className="choice-btn video-btn"
              >
                🎥 Live Video Stream
                <small>Real-time video feed</small>
              </button>
              <button onClick={handleCancel} className="cancel-btn">
                Cancel
              </button>
            </div>
          </div>
        )}

        {(captureMode === 'photo' || captureMode === 'video') && !showVideo && !error && (
          <div className="camera-start">
            <p>{captureMode === 'photo' ? 'Ready to take your photo?' : 'Ready to start video streaming?'}</p>
            <div className="camera-buttons">
              <button onClick={startCamera} className="start-camera-btn">
                📷 Start Camera
              </button>
              <button onClick={() => setCaptureMode('choice')} className="back-btn">
                ← Back
              </button>
              <button onClick={handleCancel} className="cancel-btn">
                Cancel
              </button>
            </div>
          </div>
        )}
        
        {showVideo && (
          <div className="camera-active">
            <div className="video-container">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                controls={false}
                className="camera-video"
                style={{ 
                  display: 'block', 
                  backgroundColor: '#333',
                  width: '100%',
                  maxWidth: '400px',
                  height: 'auto',
                  borderRadius: '8px',
                  transform: 'scaleX(-1)'
                }}
                onError={(e) => console.error('Video error:', e)}
                onLoadStart={() => console.log('Video load started')}
                onCanPlay={() => console.log('Video can play JSX')}
                onLoadedData={() => console.log('Video loaded data')}
                onLoadedMetadata={() => console.log('Video loaded metadata JSX')}
              />
            </div>
            <div className="camera-controls">
              {isStreamActive ? (
                <>
                  {captureMode === 'photo' ? (
                    <button onClick={capturePhoto} className="capture-btn">
                      📸 Capture Photo
                    </button>
                  ) : (
                    <button onClick={startVideoStream} className="capture-btn">
                      🎥 Start Video Stream
                    </button>
                  )}
                  <button onClick={() => setCaptureMode('choice')} className="back-btn">
                    ← Back
                  </button>
                  <button onClick={handleCancel} className="cancel-btn">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <p style={{ color: '#ffd700', margin: '10px 0' }}>Connecting to camera...</p>
                  <button onClick={handleCancel} className="cancel-btn">
                    Cancel
                  </button>
                </>
              )}
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
        
        .capture-choice {
          padding: 20px 0;
        }
        
        .choice-buttons {
          display: flex;
          flex-direction: column;
          gap: 15px;
          align-items: center;
          margin-top: 20px;
        }
        
        .choice-btn {
          background: #2196F3;
          color: white;
          border: none;
          padding: 20px 30px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.3s;
          min-width: 280px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        
        .choice-btn:hover {
          background: #1976D2;
          transform: translateY(-2px);
        }
        
        .choice-btn small {
          font-size: 12px;
          opacity: 0.8;
          font-weight: normal;
        }
        
        .photo-btn {
          background: #4CAF50;
        }
        
        .photo-btn:hover {
          background: #45a049;
        }
        
        .video-btn {
          background: #FF5722;
        }
        
        .video-btn:hover {
          background: #E64A19;
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
        
        .loading-message {
          padding: 20px 0;
          color: #ffd700;
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
        
        .back-btn {
          background: #757575;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          transition: background-color 0.3s;
        }
        
        .back-btn:hover {
          background: #616161;
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