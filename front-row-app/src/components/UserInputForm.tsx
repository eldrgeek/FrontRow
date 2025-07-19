
import React, { useState } from 'react';

interface UserInputFormProps {
  onSubmit: (name: string, imageBase64: string) => void;
}

function UserInputForm({ onSubmit }: UserInputFormProps): JSX.Element {
  const [name, setName] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result); // Base64 string for preview
      };
      reader.readAsDataURL(file);
    } else {
      setImageFile(null);
      setImagePreview(null);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name && imageFile) {
      // Pass the Base64 string from the preview for simplicity in Rev 1 in-memory
      onSubmit(name, imagePreview);
    } else {
      alert("Please enter your name and take a picture.");
    }
  };

  return (
    <div className="user-input-form">
      <form onSubmit={handleSubmit}>
        <h2>Join the Front Row</h2>
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label htmlFor="file-upload" className="custom-file-upload">
          {imagePreview ? 'Change Photo' : 'Take a Picture'}
        </label>
        <input
          id="file-upload"
          type="file"
          accept="image/*"
          capture="user" // Open front camera on mobile
          onChange={handleImageChange}
          required
          style={{ display: 'none' }}
        />
        {imagePreview && (
          <div className="image-preview-container">
            <img src={imagePreview} alt="User Preview" className="image-preview" />
          </div>
        )}
        <button type="submit">Enter FRONT ROW</button>
      </form>
    </div>
  );
}

export default UserInputForm;
