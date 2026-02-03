import { useState, useEffect, useRef } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import "./App.css";

interface Case {
  id: string; // stable, backend ID (case_1)
  name: string; // editable display name
  folder: string;
  flair_slices: string[];
  t1ce_slices: string[];
}

function App() {
  const [cases, setCases] = useState<Case[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5); // default 50% transparency
  const [showOverlay, setShowOverlay] = useState(false);
  const [view, setView] = useState<"axial"|"sagittal"|"coronal">("axial");
  const [sliceIndex, setSliceIndex] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(260); // initial width

  // sidebar adjustment logic
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    e.preventDefault();
  };
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const newWidth = e.clientX;
    const minWidth = 150;
    const maxWidth = 500;
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      setSidebarWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeCase = cases.find((c) => c.id === activeCaseId) || null;

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
        sliceIndex: sliceIndex,
        view: view
      }),
    })
      .then((res) => res.json())
      .then((data) => setOverlayUrl(data.overlayUrl + `?t=${Date.now()}`))
      .catch(console.error);
  }, [sliceIndex, activeCaseId, showOverlay, view]);

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
    setSliceIndex(0);
    setShowOverlay(false);
  };

  // Handle Detect Tumors click
  const handleDetect = async () => {
    if (!activeCase) return;

    if (showOverlay) {
      setShowOverlay(false);
      return;
    }

    const res = await fetch("/api/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: activeCase.id,
        sliceIndex: sliceIndex,
        view: view
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

  const saveCaseName = async (c: Case) => {
    if (!editedName.trim()) return;

    await fetch(`/api/cases/${c.id}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editedName }),
    });

    setCases((prev) =>
      prev.map((cs) =>
        cs.id === c.id ? { ...cs, name: editedName } : cs
      )
    );

    setEditingCaseId(null);
  };

  // Update overlay when slice or view changes
  useEffect(() => {
    if (!showOverlay || !activeCase) return;

    fetch("/api/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: activeCase.id,
        sliceIndex: sliceIndex,
        view: view
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        setOverlayUrl(data.overlayUrl + `?t=${Date.now()}`);
        // setMaxSlice(data.maxIndex);
      })
      .catch(console.error);
  }, [sliceIndex, view, activeCaseId, showOverlay]);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1>Brain Tumor Segmentation</h1>
      </header>

      <div className="content">
        {/* Sidebar */}
        <div 
          className="sidebar"
          ref={sidebarRef}
          style={{ width: `${sidebarWidth}px` }}
        >
          <div className="sidebar-upload">
            <button className="upload-button" onClick={handleUploadClick}>
              Upload
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
                className={"case-row"}
              >
                {editingCaseId === c.id ? (
                  <input
                    autoFocus
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onBlur={() => saveCaseName(c)}
                    onKeyDown={(e) => e.key === "Enter" && saveCaseName(c)}
                  />
                ) : (
                  <button
                    className={`file-button ${c.id === activeCaseId ? "active" : ""}`}
                    onClick={() => {
                      setActiveCaseId(c.id);
                      setSliceIndex(0);
                      setShowOverlay(false);
                    }}
                    onDoubleClick={() => {
                      setEditingCaseId(c.id);
                      setEditedName(c.name);
                    }}
                  >
                    {c.name}
                  </button>
                )}

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
          {/* drag handle */}
          <div
            className="sidebar-resize-handle"
            onMouseDown={handleMouseDown}
          ></div>
        </div>

        {/* Main viewer */}
        <div className="main">
          {activeCase ? (
            <>
            <h2>{activeCase.name}</h2>
            {/* Controls panel */}
            <div className="controls-panel">

              {/* Dropdown to select view */}
              <div className="view-controls">
                <label>
                  View:{" "}
                  <select value={view} onChange={(e) => {
                    setView(e.target.value as "axial"|"sagittal"|"coronal");
                    setSliceIndex(0); // reset slice to first for new view
                  }}>
                    <option value="axial">Axial</option>
                    <option value="sagittal">Sagittal</option>
                    <option value="coronal">Coronal</option>
                  </select>
                </label>
              </div>

              {/* Show/hide tumor checkbox */}
              <div className="overlay-toggle">
                {/* Show / Hide Tumor Overlay */}
                <label>
                  <input
                    type="checkbox"
                    checked={showOverlay}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      if (checked) {
                        handleDetect(); // run detection when checked
                      } else {
                        setShowOverlay(false); // hide overlay when unchecked
                      }
                    }}
                  />
                  Show Tumor Overlay
                </label>
              </div>

              {/* Slice slider */}
              <div className="slice-controls">
                    <span>
                      Slice {sliceIndex + 1} / {activeCase.flair_slices[view].length}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={activeCase.flair_slices[view].length - 1}
                      value={sliceIndex}
                      onChange={(e) => setSliceIndex(Number(e.target.value))}
                    />
                  </div>

              {/* Overlay opacity */}
              {showOverlay && (
                <div className="opacity-slider">
                  <label>Overlay Opacity</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                  />
                </div>
              )}
              {/* Legend */}
              {showOverlay && (
                <div className="legend-panel">
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
            </div>

              {/* Image viewers */}
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
                                  src={activeCase?.flair_slices[view][sliceIndex]}
                                  className="preview-image"
                                  alt={`FLAIR ${view}`}
                                />
                                {showOverlay && overlayUrl && (
                                  <img
                                    src={overlayUrl}
                                    className="overlay-image"
                                    alt="Tumor overlay"
                                    style={{ opacity: overlayOpacity }}
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
                                  src={activeCase?.t1ce_slices[view][sliceIndex]}
                                  className="preview-image"
                                  alt={`T1CE ${view}`}
                                />
                                {showOverlay && overlayUrl && (
                                  <img
                                    src={overlayUrl}
                                    className="overlay-image"
                                    alt="Tumor overlay"
                                    style={{ opacity: overlayOpacity }}
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
                </div>
              </div>
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
