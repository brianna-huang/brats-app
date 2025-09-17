import { useState } from 'react'
import './App.css'

function App() {
  const [files, setFiles] = useState<File[]>([]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFiles(Array.from(event.target.files));
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      alert("Please select files first.");
      return;
    }

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();
    console.log("file upload: ", result);
    alert("Files uploaded successfully!");
  };

  return (
    <div>
      <h2>Upload Flair + T1CE Images</h2>
      <input
        type="file"
        multiple
        onChange={handleFileChange}
      />
      
      <button onClick={handleUpload}>Upload</button>
    </div>
  );
}

export default App;