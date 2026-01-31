import { useState, useRef } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import './App.css'

function App() {
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [zoom, setZoom] = useState(1);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;

    const files = Array.from(event.target.files);

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    // Append to existing uploaded files
    setUploadedFiles((prev) => [...prev, ...result.files]);

    // Select first newly uploaded file
    setSelectedFile(result.files[0]);
  };
  

  return (
    <div className="app-container">
      {/* TITLE */}
      <header className="app-header">
        <h1>Brain Tumor Detection</h1>
      </header>

      <div className="content">
        {/* SIDEBAR */}
        <div className="sidebar">
          <div className="sidebar-upload">
            <input
              type="file"
              multiple
              onChange={handleUploadFiles}   // handles the upload directly
              ref={fileInputRef}
              style={{ display: "none" }}    // hide the default file input
            />
            <button
              className="upload-button"
              onClick={() => fileInputRef.current?.click()} // triggers the hidden input
            >
              Upload
            </button>
          </div>
          <h4>Files</h4>
          {uploadedFiles.map(file => (
          <div key={file} className="sidebar-item">
            <button
              className={`file-button ${file === selectedFile ? 'active' : ''}`}
              onClick={() => setSelectedFile(file)}
            >
              {file}
            </button>

            <button
              className="delete-button"
              onClick={async () => {
                await fetch(`/api/delete/${file}`, { method: "DELETE" });
                setUploadedFiles(prev => prev.filter(f => f !== file));
                if (selectedFile === file) {
                  setSelectedFile(null);
                }
              }}
            >
            ✕
      </button>
    </div>
  ))}
        </div>

        {/* MAIN PANEL */}
        <div className="main">

          {selectedFile && (
            <>
              <div className="active-file-name">{selectedFile}</div>
              <div className="image-container"> {/* new wrapper */}
                <TransformWrapper
                  initialScale={1}
                  minScale={0.5}
                  maxScale={5}
                  wheel={{ step: 0.1 }}
                  onZoom={(ref) => setZoom(ref.state.scale)}
                  onPanning={(ref) => setZoom(ref.state.scale)}
                >
                  {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                      <TransformComponent>
                        <div className="image-wrapper">
                          <img
                            src={`/api/uploads/${selectedFile}`}
                            alt="Uploaded"
                            className="preview-image"
                          />
                          {showOverlay && <div className="tumor-overlay" />}
                        </div>
                      </TransformComponent>

                      {/* Toolbar outside the TransformComponent so it doesn't scale */}
                      <div className="zoom-toolbar">
                        <button onClick={() => {zoomIn(); setZoom((prev) => Math.min(prev + 0.05, 5))}}>+</button>
                        <button onClick={() => {zoomOut(); setZoom((prev) => Math.max(prev - 0.05, 0.5))}}>−</button>
                        <button onClick={() => {resetTransform(); setZoom(1)}}>Reset</button>
                        <span className="zoom-indicator">{Math.round(zoom * 100)}%</span>
                      </div>
                    </>
                  )}
                </TransformWrapper>
              </div>

              <button
                className="detect-button"
                onClick={() => setShowOverlay(prev => !prev)}
              >
                {showOverlay ? "Hide Tumors" : "Detect Tumors"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;