import { useState, useEffect, useMemo, useRef } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import "./App.css";

interface Case {
  id: string;
  name: string;
  folder: string;
  flair_slices: {
    axial: string[];
    sagittal: string[];
    coronal: string[];
  };
  t1ce_slices: {
    axial: string[];
    sagittal: string[];
    coronal: string[];
  };
  segmentation_slices?: {
    axial: string[];
    sagittal: string[];
    coronal: string[];
  };
  confidence_slices?: {
    axial: string[];
    sagittal: string[];
    coronal: string[];
  };
}

type AIVizMode = "off" | "segmentation" | "confidence";

function App() {
  const [cases, setCases] = useState<Case[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");
  const [aiVizMode, setAiVizMode] = useState<AIVizMode>("off");
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [legend, setLegend] = useState<any>(null); 
  const [overlayOpacity, setOverlayOpacity] = useState(70); // default 50% transparency
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

  const alreadyComputed =
    !!activeCase?.segmentation_slices &&
    !!activeCase?.confidence_slices;

  // Fetch all cases on load
  useEffect(() => {
    fetch("/api/cases")
      .then((res) => res.json())
      .then((data) => setCases(data))
      .catch(console.error);
  }, []);

  // Update overlay when slider or view changes
  const overlaySrc = useMemo(() => {
    if (!activeCase || aiVizMode === "off") return null;

    if (aiVizMode === "segmentation") {
      return activeCase.segmentation_slices?.[view]?.[sliceIndex] ?? null;
    }

    if (aiVizMode === "confidence") {
      return activeCase.confidence_slices?.[view]?.[sliceIndex] ?? null;
    }

    return null;
  }, [activeCase, aiVizMode, view, sliceIndex]);

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
    setAiVizMode("off");
  };

  // Handles AI detection
  const handleDetect = async () => {
    if (!activeCase || isAiRunning) return;

    try {
      setIsAiRunning(true);
      setAiError(null);

      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: activeCase.id,
        }),
      });

      if (!res.ok) {
        throw new Error("AI inference failed");
      }

      const data = await res.json();

      setCases(prev =>
        prev.map(c =>
          c.id === activeCase.id
            ? {
                ...c,
                segmentation_slices: data.segmentation_slices,
                confidence_slices: data.confidence_slices,
              }
            : c
        )
      );
      setLegend(data.legend); 
      setAiVizMode("segmentation");
    } catch (err) {
      console.error(err);
      setAiError("Something went wrong running the AI model.");
    } finally {
      setIsAiRunning(false);
    }
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
                {/* editing case name */}
                {editingCaseId === c.id ? (
                  <input
                    autoFocus
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onBlur={() => saveCaseName(c)}
                    onKeyDown={(e) => e.key === "Enter" && saveCaseName(c)}
                  />
                ) : (
                  // case selection button
                  <button
                    className={`file-button ${c.id === activeCaseId ? "active" : ""}`}
                    onClick={() => {
                      setActiveCaseId(c.id);
                      setSliceIndex(0);
                      setAiVizMode("off");
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
              <div className="controls-wrapper">
                {/* Main controls panel (left) */}
                <div className="controls-panel">

                  {/* Button to run AI */}
                  <button
                    onClick={handleDetect}
                    disabled={!activeCase || isAiRunning || alreadyComputed}
                    className={alreadyComputed ? "ai-ready-button" : "ai-run-button"}
                    title={alreadyComputed ? "AI has finished running for this case" : "Run AI to view tumor segmentations"}
                  >
                    {alreadyComputed ? "AI Ready" : "Run AI"}
                  </button>

                  {/* Loading message */}
                  {isAiRunning && (
                    <div className="loading-overlay">
                      🧠 Running AI...please wait
                    </div>
                  )}
                  {aiError && <div className="error">{aiError}</div>}

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

                  {/* AI mode selector */}
                  <div className="ai-mode-selector">
                    <label>
                      AI overlay:
                      <input
                        type="radio"
                        checked={aiVizMode === "off"}
                        onChange={() => setAiVizMode("off")}
                      />
                      AI off
                    </label>

                    <label
                      title={
                      !activeCase?.segmentation_slices
                        ? "Run AI to view tumor segmentations"
                        : "Show tumor segmentation overlay"
                      }
                    >
                      <input
                        type="radio"
                        checked={aiVizMode === "segmentation"}
                        onChange={() => setAiVizMode("segmentation")}
                        disabled={!activeCase?.segmentation_slices}
                      />
                      <span>Segmentation</span>
                    </label>

                    <label
                      title={
                        !activeCase?.confidence_slices
                          ? "Run AI to view confidence heatmap"
                          : "Show confidence heatmap overlay"
                      }
                    >
                      <input
                        type="radio"
                        checked={aiVizMode === "confidence"}
                        onChange={() => setAiVizMode("confidence")}
                        disabled={!activeCase?.confidence_slices}
                      />
                      <span>Confidence</span>
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

                </div>
                
                {/* Opacity & legends (right) */}
                {aiVizMode !== "off" && (
                  <div className="controls-side-panel">
                    {/* Segmentation legend */}
                    {aiVizMode === "segmentation" && (
                      <div className="legend-panel">
                        <h4>Segmentation</h4>
                        {Object.entries(legend.segmentation as Record<string, string>).map(([cls, name]) => (
                          <div key={cls} className="legend-item">
                            <span
                              className={`legend-color ${cls === "1" ? "necrotic" : cls === "2" ? "edema" : "enhancing"}`}
                            />
                            {name}
                          </div>
                        ))}
                        </div>)
                    }
                    {/* Confidence legend */}
                    {aiVizMode === "confidence" && (
                      <div className="legend-panel">
                        <h4>Confidence heatmap</h4>
                        <div className="legend-item">
                          100% <div className="confidence-legend-bar" />0%
                        </div>
                      </div>
                    )}
                    {/* Overlay opacity */}
                    <div className="opacity-slider">
                      <label>
                        {aiVizMode === "segmentation"
                          ? "Segmentation opacity"
                          : "Confidence overlay strength"}
                          : {Math.round(overlayOpacity)}%
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={overlayOpacity}
                        onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                      />
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
                                  {overlaySrc && (
                                    <img
                                      src={overlaySrc}
                                      className="overlay-image"
                                      style={{ opacity: overlayOpacity / 100 }}
                                      alt={`${aiVizMode} overlay`}
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
                                  {overlaySrc && (
                                    <img
                                      src={overlaySrc}
                                      className="overlay-image"
                                      style={{ opacity: overlayOpacity / 100 }}
                                      alt={`${aiVizMode} overlay`}
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
