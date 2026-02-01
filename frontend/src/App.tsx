import { useState, useEffect, useRef } from "react";
import "./App.css";

interface Case {
  id: string;
  name: string;
  folder: string;
  flair_slices: string[];
  t1ce_slices: string[];
}

function App() {
  const [cases, setCases] = useState<Case[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [flairSlice, setFlairSlice] = useState(0);
  const [t1ceSlice, setT1ceSlice] = useState(0);
  const [lockSlices, setLockSlices] = useState(true);


  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch all cases on load
  useEffect(() => {
    fetch("/api/cases")
      .then((res) => res.json())
      .then((data) => setCases(data))
      .catch(console.error);
  }, []);

  const activeCase = cases.find((c) => c.id === activeCaseId) || null;

  // Handle upload button click (opens file picker)
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Handle file selection
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length !== 2) {
      alert("Please select exactly 2 files: FLAIR and T1CE");
      return;
    }

    const formData = new FormData();
    Array.from(event.target.files).forEach((file) => formData.append("files", file));

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    // Add new case to state
    setCases((prev) => [...prev, data.case]);
    setActiveCaseId(data.case.id);

    // Reset slice indices
    setFlairSlice(0);
    setT1ceSlice(0);
    setShowOverlay(false);
  };

  // Handle Detect Tumors click
  const handleDetect = async () => {
    if (!activeCase) return;

    // Here you would call your model endpoint like:
    // const res = await fetch(`/api/predict/${activeCase.id}`);
    // const overlaySlices = await res.json();
    // For now we just toggle fake overlay
    setShowOverlay((prev) => !prev);
  };

  const deleteCase = async (caseId: string) => {
    await fetch(`api/cases/${caseId}`, {
      method: "DELETE",
    });

    setCases((prev) => prev.filter((c) => c.id !== caseId));

    if (activeCaseId === caseId) {
      setActiveCaseId(null);
    }
  };


  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1>Brain Tumor Viewer</h1>
      </header>

      <div className="content">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-upload">
            <button className="upload-button" onClick={handleUploadClick}>
              Upload Case
            </button>
            <input
              type="file"
              accept=".nii,.nii.gz"
              multiple
              hidden
              ref={fileInputRef}
              onChange={handleFileChange}
            />
          </div>

          <div className="case-list">
            {cases.map((c) => (
              <div
                key={c.id}
                className={`case-row ${c.id === activeCaseId ? "active" : ""}`}
              >
                <button
                  className="file-button"
                  onClick={() => {
                    setActiveCaseId(c.id);
                    setFlairSlice(0);
                    setT1ceSlice(0);
                    setShowOverlay(false);
                  }}
                >
                  {c.name}
                </button>

                <button
                  className="delete-button"
                  onClick={(e) => {
                    e.stopPropagation(); // prevents selecting the case
                    deleteCase(c.id);
                  }}
                  title="Delete case"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main viewer */}
        <div className="main">
          {activeCase ? (
            <>
            <h2>Case {activeCaseId}</h2>
              <div className="slice-lock">
                <label>
                  <input
                    type="checkbox"
                    checked={lockSlices}
                    onChange={(e) => setLockSlices(e.target.checked)}
                  />
                  Lock slices
                </label>
              </div>
              <div className="volume-viewer">
                {/* FLAIR */}
                <div className="volume-panel">
                  <h3>FLAIR</h3>
                  <div className="image-container">
                    <img
                      src={activeCase.flair_slices[flairSlice]}
                      alt={`FLAIR slice ${flairSlice}`}
                      className="preview-image"
                    />
                    {showOverlay && <div className="tumor-overlay" />}
                  </div>
                  <div className="slice-controls">
                    <span>
                      Slice {flairSlice + 1} / {activeCase.flair_slices.length}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={activeCase.flair_slices.length - 1}
                      value={flairSlice}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setFlairSlice(value);
                        if (lockSlices) {
                          setT1ceSlice(
                            Math.min(value, activeCase.t1ce_slices.length - 1)
                          );
                        }
                      }}
                    />
                  </div>
                </div>

                {/* T1CE */}
                <div className="volume-panel">
                  <h3>T1CE</h3>
                  <div className="image-container">
                    <img
                      src={activeCase.t1ce_slices[t1ceSlice]}
                      alt={`T1CE slice ${t1ceSlice}`}
                      className="preview-image"
                    />
                    {showOverlay && <div className="tumor-overlay" />}
                  </div>
                  <div className="slice-controls">
                    <span>
                      Slice {t1ceSlice + 1} / {activeCase.t1ce_slices.length}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={activeCase.t1ce_slices.length - 1}
                      value={t1ceSlice}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setT1ceSlice(value);
                        if (lockSlices) {
                          setFlairSlice(
                            Math.min(value, activeCase.flair_slices.length - 1)
                          );
                        }
                      }}
                    />

                  </div>
                </div>
              </div>

              <button className="detect-button" onClick={handleDetect}>
                {showOverlay ? "Hide Overlay" : "Detect Tumors"}
              </button>
            </>
          ) : (
            <p>Please upload a case or select one from the sidebar.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
