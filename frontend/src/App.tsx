import { useState, useEffect, useRef } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import "./App.css";

interface Case {
  id: string; // ex: "case_1"
  name: string; // ex: "glioblastoma-baseline"
  folder: string;
  flair_slices: string[];
  t1ce_slices: string[];
}

function App() {
  const [cases, setCases] = useState<Case[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
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

// Update overlay when slider changes (if overlay is shown)
  useEffect(() => {
    if (!showOverlay || !activeCase) return;

    // Re-fetch overlay for the current slice
    fetch("/api/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: activeCase.id,
        sliceIndex: flairSlice,
      }),
    })
      .then((res) => res.json())
      .then((data) => setOverlayUrl(data.overlayUrl + `?t=${Date.now()}`))
      .catch(console.error);
  }, [flairSlice, t1ceSlice, activeCaseId, showOverlay]);

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

    const res = await fetch("/api/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: activeCase.id,
        sliceIndex: flairSlice, // or t1ceSlice if synced
      }),
    });

    const data = await res.json();
    setOverlayUrl(data.overlayUrl + `?t=${Date.now()}`); // cache-busting
    setShowOverlay(true);
  };

  // Handles case deletion
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
                    <TransformWrapper
                      initialScale={1}
                      minScale={0.5}
                      maxScale={5}
                      wheel={{ step: 0.1 }}
                    >
                      {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                          {/* IMAGE + OVERLAY (these zoom together) */}
                          <TransformComponent
                            wrapperStyle={{ width: "100%", height: "100%" }}
                            contentStyle={{ width: "100%", height: "100%" }}
                          >
                            <div className="image-stage">
                              <div className="image-layer">
                                <img
                                  src={activeCase.flair_slices[flairSlice]}
                                  className="preview-image"
                                  alt="FLAIR"
                                />
                                {showOverlay && overlayUrl && (
                                  <img
                                    src={overlayUrl}
                                    className="overlay-image"
                                    alt="Tumor overlay"
                                  />
                                )}
                              </div>
                            </div>
                          </TransformComponent>

                          {/* TOOLBAR (does NOT zoom) */}
                          <div className="zoom-toolbar">
                            <button onClick={() => zoomIn()}>+</button>
                            <button onClick={() => zoomOut()}>−</button>
                            <button onClick={() => resetTransform()}>Reset</button>
                          </div>
                        </>
                      )}
                    </TransformWrapper>
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
                    <TransformWrapper
                      initialScale={1}
                      minScale={0.5}
                      maxScale={5}
                      wheel={{ step: 0.1 }}
                    >
                      {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                          {/* IMAGE + OVERLAY (these zoom together) */}
                          <TransformComponent
                            wrapperStyle={{ width: "100%", height: "100%" }}
                            contentStyle={{ width: "100%", height: "100%" }}
                          >
                            <div className="image-stage">
                              <div className="image-layer">
                                <img
                                  src={activeCase.t1ce_slices[t1ceSlice]}
                                  className="preview-image"
                                  alt="T1CE"
                                />
                                {showOverlay && overlayUrl && (
                                  <img
                                    src={overlayUrl}
                                    className="overlay-image"
                                    alt="Tumor overlay"
                                  />
                                )}
                              </div>
                            </div>
                          </TransformComponent>

                          {/* TOOLBAR (does NOT zoom) */}
                          <div className="zoom-toolbar">
                            <button onClick={() => zoomIn()}>+</button>
                            <button onClick={() => zoomOut()}>−</button>
                            <button onClick={() => resetTransform()}>Reset</button>
                          </div>
                        </>
                      )}
                    </TransformWrapper>
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

              {/* Legend for tumor classes*/}
              {showOverlay && (
                <div className="legend">
                  <h4>Tumor Classes</h4>
                  <div className="legend-item">
                    <span className="legend-color necrotic" /> Necrotic / Core
                  </div>
                  <div className="legend-item">
                    <span className="legend-color edema" /> Edema
                  </div>
                  <div className="legend-item">
                    <span className="legend-color enhancing" /> Enhancing
                  </div>
                </div>
              )}

              {/* Detect tumors button */}
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
