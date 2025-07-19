
import React, { useState } from 'react';

interface UserInputFormProps {
  onSubmit: (name: string, imageBase64: string) => void;
}

function UserInputForm({ onSubmit }: UserInputFormProps): JSX.Element {
  // Initialize name from localStorage if available
  const [name, setName] = useState<string>(() => {
    return localStorage.getItem('frontrow_user_name') || '';
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(() => {
    return localStorage.getItem('frontrow_user_image') || null;
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string); // Base64 string for preview
      };
      reader.readAsDataURL(file);
    } else {
      setImageFile(null);
      setImagePreview(null);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (name.trim()) {
      // Allow submission with just name for now, image is optional
      const defaultImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNjY2MiLz4KPHRleHQgeD0iMjAiIHk9IjI1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IndoaXRlIj7wn5GBPC90ZXh0Pgo8L3N2Zz4K';
      onSubmit(name.trim(), imagePreview || defaultImage);
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
        <label htmlFor="file-upload" className="custom-file-upload">
          {imagePreview ? 'Change Photo' : 'Take a Picture'}
        </label>
        <input
          id="file-upload"
          type="file"
          accept="image/*"
          capture="user" // Open front camera on mobile
          onChange={handleImageChange}
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
