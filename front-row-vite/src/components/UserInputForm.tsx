
import React, { useState } from 'react';
import CameraCapture from './CameraCapture';

interface UserInputFormProps {
  onSubmit: (name: string, imageBase64: string, isArtist: boolean, videoStream?: MediaStream, captureMode?: 'photo' | 'video') => void;
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

  // Generate a random avatar
  const generateRandomAvatar = () => {
    const avatars = [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
      '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
      '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
      '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦄'
    ];
    const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];
    
    // Create SVG with the emoji
    const svgContent = `
      <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="50" fill="#4A90E2"/>
        <text x="50" y="65" text-anchor="middle" font-family="Arial" font-size="40">${randomAvatar}</text>
      </svg>
    `;
    
    return `data:image/svg+xml;base64,${btoa(svgContent)}`;
  };

  const handleTakePicture = () => {
    setShowCamera(true);
  };

  const handlePhotoCapture = (photoDataUrl: string) => {
    setImagePreview(photoDataUrl);
    setShowCamera(false);
  };

  const handleCameraCancel = () => {
    setShowCamera(false);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (name.trim()) {
      // Use photo if available, otherwise generate random avatar
      const finalImage = imagePreview || generateRandomAvatar();
      
      console.log('🚀 UserInputForm submitting:', {
        name: name.trim(),
        hasImage: !!imagePreview,
        hasRandomAvatar: !imagePreview,
        isArtist
      });
      
      // Always submit with photo mode initially - video choice happens after login
      onSubmit(name.trim(), finalImage, isArtist, undefined, 'photo');
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
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={handleTakePicture} className="custom-file-upload">
            {imagePreview ? 'Update Photo' : 'Take a Picture'}
          </button>
        </div>
        {imagePreview && (
          <div className="image-preview-container" style={{ margin: '15px 0' }}>
            <img src={imagePreview} alt="User Preview" className="image-preview" />
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
          mode="photo"
          onPhotoCapture={handlePhotoCapture}
          onCancel={handleCameraCancel}
        />
      )}
    </div>
  );
}

export default UserInputForm;
