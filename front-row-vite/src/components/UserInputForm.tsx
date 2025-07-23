
import React, { useState } from 'react';
import CameraCapture from './CameraCapture';

interface UserInputFormProps {
  onSubmit: (name: string, imageBase64: string, isArtist: boolean, videoStream?: MediaStream) => void;
}

function UserInputForm({ onSubmit }: UserInputFormProps): JSX.Element {
  // Initialize name from sessionStorage if available (per-tab isolation)
  const [name, setName] = useState<string>(() => {
    return sessionStorage.getItem('frontrow_user_name') || '';
  });
  const [imagePreview, setImagePreview] = useState<string | null>(() => {
    return sessionStorage.getItem('frontrow_user_image') || null;
  });
  const [isArtist, setIsArtist] = useState<boolean>(() => {
    // Check if user was previously set as artist
    return sessionStorage.getItem('frontrow_is_artist') === 'true';
  });
  const [showCamera, setShowCamera] = useState<boolean>(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [captureMode, setCaptureMode] = useState<'photo' | 'video' | null>(null);

  const handleTakePicture = () => {
    setShowCamera(true);
  };

  const handlePhotoCapture = (photoDataUrl: string) => {
    setImagePreview(photoDataUrl);
    setCaptureMode('photo');
    setVideoStream(null);
    setShowCamera(false);
  };

  const handleVideoStream = (stream: MediaStream) => {
    setVideoStream(stream);
    setCaptureMode('video');
    setImagePreview(null);
    setShowCamera(false);
  };

  const handleCameraCancel = () => {
    setShowCamera(false);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (name.trim()) {
      // Allow submission with just name for now, image is optional
      const defaultImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNjY2MiLz4KPHRleHQgeD0iMjAiIHk9IjI1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IndoaXRlIj7wn5GBPC90ZXh0Pgo8L3N2Zz4K';
      onSubmit(name.trim(), imagePreview || defaultImage, isArtist, videoStream || undefined);
    } else {
      alert("Please enter your name to continue.");
    }
  };

  return (
    <div className="user-input-form">
      <form onSubmit={handleSubmit}>
        <h2>Tonight's Concert</h2>
        <h3 style={{ color: '#ffd700', marginBottom: '20px', fontSize: '1.4em' }}>Jess Wayne</h3>
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button type="button" onClick={handleTakePicture} className="custom-file-upload">
          {captureMode === 'photo' ? 'Change Photo' : captureMode === 'video' ? 'Change Video Stream' : 'Take Photo or Start Video'}
        </button>
        {imagePreview && captureMode === 'photo' && (
          <div className="image-preview-container">
            <img src={imagePreview} alt="User Preview" className="image-preview" />
            <p style={{ fontSize: '12px', color: '#ffd700', margin: '5px 0' }}>📷 Photo Mode</p>
          </div>
        )}
        {videoStream && captureMode === 'video' && (
          <div className="video-preview-container">
            <video 
              autoPlay 
              playsInline 
              muted 
              style={{ 
                width: '100px', 
                height: '75px', 
                borderRadius: '8px',
                border: '2px solid #ffd700',
                transform: 'scaleX(-1)'
              }}
              ref={(video) => {
                if (video && videoStream) {
                  video.srcObject = videoStream;
                }
              }}
            />
            <p style={{ fontSize: '12px', color: '#ff5722', margin: '5px 0' }}>🎥 Video Stream Active</p>
          </div>
        )}
        <div className="artist-checkbox-container" style={{ margin: '15px 0', textAlign: 'left' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9em' }}>
            <input
              type="checkbox"
              checked={isArtist}
              onChange={(e) => setIsArtist(e.target.checked)}
              style={{ marginRight: '8px', transform: 'scale(1.2)' }}
            />
            🎤 I'm performing tonight
          </label>
        </div>
        <button type="submit">Enter FRONT ROW</button>
      </form>
      
      {showCamera && (
        <CameraCapture
          onPhotoCapture={handlePhotoCapture}
          onVideoStream={handleVideoStream}
          onCancel={handleCameraCancel}
        />
      )}
    </div>
  );
}

export default UserInputForm;
