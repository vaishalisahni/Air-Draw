import { useEffect, useRef, useState, useCallback } from "react";

const COLORS = [
  { c: "#00f0ff", name: "Cyan" },
  { c: "#ff00e5", name: "Magenta" },
  { c: "#39ff14", name: "Lime" },
  { c: "#4d6dff", name: "Electric Blue" },
  { c: "#ff2d6b", name: "Hot Pink" },
  { c: "#ffd700", name: "Gold" },
  { c: "#b400ff", name: "Purple" },
  { c: "#ffffff", name: "White" },
];

const HUD = {
  draw: ["☝️", "Drawing"],
  erase: ["✋", "Erasing"],
  move: ["🤏", "Moving"],
  idle: ["✊", "Idle"],
  hover: ["🖐", "Hover"],
  none: ["👀", "Show your hand"],
};

const SMOOTHING = 0.4;
const MAX_UNDO = 30;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

export default function App() {
  const videoRef = useRef(null);
  const camCanvasRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const uiCanvasRef = useRef(null);

  const handsRef = useRef(null);
  const cameraRef = useRef(null);

  // Mutable, non-rendered draw state (mirrors the original vanilla `state` object).
  // Kept out of React state so the per-frame gesture loop doesn't trigger re-renders.
  const stateRef = useRef({
    color: "#00f0ff",
    size: 6,
    glow: 60,
    cameraOn: true,
    started: false,
    drawing: false,
    lastPoint: null,
    smoothPoint: null,
    grab: null,
    undoStack: [],
  });

  // React-rendered UI state
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [activeColor, setActiveColor] = useState("#00f0ff");
  const [thickness, setThickness] = useState(6);
  const [glow, setGlow] = useState(60);
  const [cameraOn, setCameraOn] = useState(true);
  const [gesture, setGesture] = useState("none");

  // Keep stateRef in sync with UI-driven values
  useEffect(() => { stateRef.current.color = activeColor; }, [activeColor]);
  useEffect(() => { stateRef.current.size = thickness; }, [thickness]);
  useEffect(() => { stateRef.current.glow = glow; }, [glow]);
  useEffect(() => { stateRef.current.cameraOn = cameraOn; }, [cameraOn]);

  const revealApp = useCallback(() => {
    if (stateRef.current._revealed) return;
    stateRef.current._revealed = true;
    setRevealed(true);
    setOnboardingOpen(true);
    setTimeout(() => setLoading(false), 600);
  }, []);

  // ---------- Canvas sizing ----------
  const resize = useCallback(() => {
    const camCanvas = camCanvasRef.current;
    const uiCanvas = uiCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (!camCanvas || !uiCanvas || !drawCanvas) return;

    const w = window.innerWidth, h = window.innerHeight;
    camCanvas.width = w; camCanvas.height = h;
    uiCanvas.width = w; uiCanvas.height = h;

    if (drawCanvas.width && drawCanvas.height) {
      const snap = document.createElement("canvas");
      snap.width = drawCanvas.width; snap.height = drawCanvas.height;
      snap.getContext("2d").drawImage(drawCanvas, 0, 0);
      drawCanvas.width = w; drawCanvas.height = h;
      drawCanvas.getContext("2d").drawImage(snap, 0, 0, w, h);
    } else {
      drawCanvas.width = w; drawCanvas.height = h;
    }
  }, []);

  // ---------- Undo helpers ----------
  const pushUndo = useCallback(() => {
    const drawCanvas = drawCanvasRef.current;
    try {
      const img = drawCanvas
        .getContext("2d")
        .getImageData(0, 0, drawCanvas.width, drawCanvas.height);
      stateRef.current.undoStack.push(img);
      if (stateRef.current.undoStack.length > MAX_UNDO) stateRef.current.undoStack.shift();
    } catch (_) {}
  }, []);

  const undo = useCallback(() => {
    const drawCtx = drawCanvasRef.current.getContext("2d");
    const img = stateRef.current.undoStack.pop();
    if (img) drawCtx.putImageData(img, 0, 0);
    else drawCtx.clearRect(0, 0, drawCanvasRef.current.width, drawCanvasRef.current.height);
  }, []);

  const clear = useCallback(() => {
    pushUndo();
    const drawCanvas = drawCanvasRef.current;
    drawCanvas.getContext("2d").clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  }, [pushUndo]);

  const save = useCallback(() => {
    const drawCanvas = drawCanvasRef.current;
    const out = document.createElement("canvas");
    out.width = drawCanvas.width; out.height = drawCanvas.height;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(drawCanvas, 0, 0);
    const a = document.createElement("a");
    a.download = `air-draw-${Date.now()}.png`;
    a.href = out.toDataURL("image/png");
    a.click();
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraOn((v) => !v);
  }, []);

  const openHelp = useCallback(() => {
    setOnboardingOpen(true);
    stateRef.current.started = false;
  }, []);

  const startApp = useCallback(() => {
    setOnboardingOpen(false);
    stateRef.current.started = true;
  }, []);

  // ---------- Gesture math ----------
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const fingersUp = (lm) => {
    const up = [];
    for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) {
      up.push(lm[tip].y < lm[pip].y - 0.02);
    }
    return up; // [index, middle, ring, pinky]
  };

  const classify = (lm) => {
    const palm = dist(lm[0], lm[9]) || 1;
    if (dist(lm[4], lm[8]) / palm < 0.35) return "move";
    const [index, middle, ring, pinky] = fingersUp(lm);
    const count = [index, middle, ring, pinky].filter(Boolean).length;
    if (count === 0) return "idle";
    if (index && !middle && !ring && !pinky) return "draw";
    if (count >= 3) return "erase";
    return "hover";
  };

  // ---------- Drawing primitives ----------
  const strokeTo = (p) => {
    const drawCtx = drawCanvasRef.current.getContext("2d");
    const s = stateRef.current;
    drawCtx.save();
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    drawCtx.strokeStyle = s.color;
    drawCtx.lineWidth = s.size;
    if (s.glow > 0) {
      drawCtx.shadowColor = s.color;
      drawCtx.shadowBlur = (s.glow / 100) * 30;
    }
    drawCtx.beginPath();
    drawCtx.moveTo(s.lastPoint.x, s.lastPoint.y);
    drawCtx.lineTo(p.x, p.y);
    drawCtx.stroke();
    drawCtx.restore();
  };

  const eraseAt = (p) => {
    const drawCtx = drawCanvasRef.current.getContext("2d");
    const s = stateRef.current;
    drawCtx.save();
    drawCtx.globalCompositeOperation = "destination-out";
    drawCtx.beginPath();
    drawCtx.arc(p.x, p.y, Math.max(s.size * 5, 40), 0, Math.PI * 2);
    drawCtx.fill();
    drawCtx.restore();
  };

  const drawCursor = (p, gestureName) => {
    const uiCtx = uiCanvasRef.current.getContext("2d");
    const s = stateRef.current;
    uiCtx.clearRect(0, 0, uiCanvasRef.current.width, uiCanvasRef.current.height);
    if (!p) return;
    uiCtx.save();
    if (gestureName === "erase") {
      uiCtx.beginPath();
      uiCtx.arc(p.x, p.y, Math.max(s.size * 5, 40), 0, Math.PI * 2);
      uiCtx.strokeStyle = "#ffd700";
      uiCtx.setLineDash([6, 6]);
      uiCtx.lineWidth = 2;
      uiCtx.stroke();
    } else if (gestureName === "move") {
      uiCtx.beginPath();
      uiCtx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      uiCtx.strokeStyle = "#39ff14";
      uiCtx.lineWidth = 2;
      uiCtx.stroke();
    } else {
      uiCtx.beginPath();
      uiCtx.arc(p.x, p.y, Math.max(s.size, 6), 0, Math.PI * 2);
      uiCtx.strokeStyle = gestureName === "draw" ? s.color : "rgba(255,255,255,.5)";
      uiCtx.lineWidth = 2;
      uiCtx.shadowColor = s.color;
      uiCtx.shadowBlur = gestureName === "draw" ? 12 : 0;
      uiCtx.stroke();
      if (gestureName === "draw") {
        uiCtx.fillStyle = s.color;
        uiCtx.beginPath();
        uiCtx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        uiCtx.fill();
      }
    }
    uiCtx.restore();
  };

  const endGrab = () => { stateRef.current.grab = null; };

  // ---------- Per-frame results handler ----------
  const onResultsRef = useRef(null);
  onResultsRef.current = (results) => {
    revealApp();
    const s = stateRef.current;
    const camCanvas = camCanvasRef.current;
    const camCtx = camCanvas.getContext("2d");
    const drawCanvas = drawCanvasRef.current;
    const drawCtx = drawCanvas.getContext("2d");

    if (s.cameraOn && results.image) {
      camCtx.save();
      camCtx.clearRect(0, 0, camCanvas.width, camCanvas.height);
      camCtx.translate(camCanvas.width, 0);
      camCtx.scale(-1, 1);
      camCtx.filter = "brightness(0.55) saturate(0.8)";
      const iw = results.image.width, ih = results.image.height;
      const scale = Math.max(camCanvas.width / iw, camCanvas.height / ih);
      const dw = iw * scale, dh = ih * scale;
      camCtx.drawImage(results.image, (camCanvas.width - dw) / 2, (camCanvas.height - dh) / 2, dw, dh);
      camCtx.restore();
    } else {
      camCtx.clearRect(0, 0, camCanvas.width, camCanvas.height);
    }

    const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
    if (!s.started || !hasHand) {
      s.drawing = false;
      s.lastPoint = null;
      s.smoothPoint = null;
      endGrab();
      drawCursor(null);
      const g = hasHand ? "idle" : "none";
      setGesture(g);
      return;
    }

    const lm = results.multiHandLandmarks[0];
    const gestureName = classify(lm);

    const t = gestureName === "move"
      ? { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 }
      : lm[8];
    const raw = { x: (1 - t.x) * drawCanvas.width, y: t.y * drawCanvas.height };
    s.smoothPoint = s.smoothPoint
      ? { x: s.smoothPoint.x + (raw.x - s.smoothPoint.x) * SMOOTHING,
          y: s.smoothPoint.y + (raw.y - s.smoothPoint.y) * SMOOTHING }
      : raw;
    const p = s.smoothPoint;

    if (gestureName === "move") {
      if (!s.grab) {
        pushUndo();
        const snap = document.createElement("canvas");
        snap.width = drawCanvas.width; snap.height = drawCanvas.height;
        snap.getContext("2d").drawImage(drawCanvas, 0, 0);
        s.grab = { snapshot: snap, startX: p.x, startY: p.y };
      }
      const dx = p.x - s.grab.startX;
      const dy = p.y - s.grab.startY;
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      drawCtx.drawImage(s.grab.snapshot, dx, dy);
      s.drawing = false;
      s.lastPoint = null;
      setGesture("move");
      drawCursor(p, "move");
      return;
    }
    endGrab();

    if (gestureName === "draw") {
      if (!s.drawing) {
        pushUndo();
        s.drawing = true;
        s.lastPoint = p;
      }
      strokeTo(p);
      s.lastPoint = p;
    } else if (gestureName === "erase") {
      if (!s.drawing) { pushUndo(); s.drawing = true; }
      eraseAt(p);
      s.lastPoint = null;
    } else {
      s.drawing = false;
      s.lastPoint = null;
    }

    setGesture(gestureName);
    drawCursor(p, gestureName);
  };

  // ---------- Boot: load MediaPipe scripts, start camera ----------
  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);

    let cancelled = false;

    (async () => {
      try {
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js");
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js");
        if (cancelled) return;

        const hands = new window.Hands({
          locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
        });
        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
        hands.onResults((results) => onResultsRef.current(results));
        handsRef.current = hands;

        const camera = new window.Camera(videoRef.current, {
          onFrame: async () => { await hands.send({ image: videoRef.current }); },
          width: 1280,
          height: 720,
        });
        cameraRef.current = camera;

        await camera.start();
      } catch (_) {
        setLoading(false);
        setCameraError(true);
      }
    })();

    const fallbackTimer = setTimeout(() => {
      if (!stateRef.current._revealed && (!videoRef.current?.srcObject || videoRef.current.readyState < 2)) {
        navigator.mediaDevices.getUserMedia({ video: true }).then((s) => {
          s.getTracks().forEach((tr) => tr.stop());
        }).catch(() => {
          setLoading(false);
          setCameraError(true);
        });
      }
    }, 6000);

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      window.removeEventListener("resize", resize);
      cameraRef.current?.stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [hudIcon, hudLabel] = HUD[gesture] || HUD.none;
  const hudClass = gesture === "hover" || gesture === "none" ? "idle" : gesture;

  return (
    <>
      <div id="loading-screen" className={loading ? "" : "hidden"} style={revealed ? { opacity: revealed && !loading ? undefined : 1 } : undefined}>
        <div className="loader-content">
          <div className="loader-logo">✍️ Air Draw</div>
          <p className="loader-subtitle">Initializing hand tracking…</p>
          <div className="loader-bar"><div className="loader-bar-fill"></div></div>
        </div>
      </div>

      <div id="app" className={revealed ? "" : "hidden"}>
        <video ref={videoRef} id="webcam" autoPlay playsInline muted />
        <canvas ref={camCanvasRef} id="camera-canvas" className={cameraOn ? "" : "cam-off"} />
        <canvas ref={drawCanvasRef} id="drawing-canvas" />
        <canvas ref={uiCanvasRef} id="ui-canvas" />

        <div id="gesture-hud" className={`g-${hudClass}`}>
          <div id="gesture-icon">{hudIcon}</div>
          <div id="gesture-label">{hudLabel}</div>
        </div>

        <div id="toolbar">
          <div className="toolbar-section">
            <label className="toolbar-label">Colors</label>
            <div className="color-row">
              {COLORS.map(({ c, name }) => (
                <button
                  key={c}
                  className={`color-swatch${activeColor === c ? " active" : ""}`}
                  style={{ "--swatch-color": c }}
                  title={name}
                  onClick={() => setActiveColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="toolbar-divider"></div>

          <div className="toolbar-section toolbar-section--slider">
            <label className="toolbar-label" htmlFor="thickness-slider">Thickness</label>
            <input
              type="range"
              id="thickness-slider"
              min="2"
              max="24"
              value={thickness}
              onChange={(e) => setThickness(+e.target.value)}
            />
            <span className="slider-value">{thickness}px</span>
          </div>

          <div className="toolbar-divider"></div>

          <div className="toolbar-section toolbar-section--slider">
            <label className="toolbar-label" htmlFor="glow-slider">Glow</label>
            <input
              type="range"
              id="glow-slider"
              min="0"
              max="100"
              value={glow}
              onChange={(e) => setGlow(+e.target.value)}
            />
            <span className="slider-value">{glow}%</span>
          </div>

          <div className="toolbar-divider"></div>

          <div className="toolbar-actions">
            <button className="toolbar-btn" title="Undo last stroke" onClick={undo}>
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12.5 8c-2.65 0-5.05 1.04-6.83 2.73L2.5 7.5v9h9l-3.19-3.19c1.3-1.3 3.1-2.11 5.19-2.11 3.45 0 6.35 2.37 7.16 5.57l2.27-.71C21.69 12.11 17.52 8 12.5 8z" fill="currentColor"/></svg>
            </button>
            <button className="toolbar-btn" title="Clear canvas" onClick={clear}>
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12z" fill="currentColor"/></svg>
            </button>
            <button className={`toolbar-btn${cameraOn ? " active" : ""}`} title="Toggle camera view" onClick={toggleCamera}>
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" fill="currentColor"/></svg>
            </button>
            <button className="toolbar-btn" title="Save as PNG" onClick={save}>
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z" fill="currentColor"/></svg>
            </button>
            <button className="toolbar-btn" title="How to play" onClick={openHelp}>
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14a4 4 0 00-4 4h2a2 2 0 114 0c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5a4 4 0 00-4-4z" fill="currentColor"/></svg>
            </button>
          </div>
        </div>

        <div id="camera-mode-indicator"><span>{cameraOn ? "Camera ON" : "Camera OFF"}</span></div>
      </div>

      <div id="onboarding-modal" className={onboardingOpen ? "" : "hidden"}>
        <div className="onboarding-content">
          <div className="onboarding-logo">✍️</div>
          <h2 className="onboarding-title">How to Play</h2>
          <div className="onboarding-grid">
            <div className="onboarding-item">
              <div className="onboarding-icon">☝️</div>
              <div className="onboarding-text"><strong>Draw</strong><span>Point index finger to draw</span></div>
            </div>
            <div className="onboarding-item">
              <div className="onboarding-icon">✋</div>
              <div className="onboarding-text"><strong>Erase</strong><span>Sweep open palm to erase</span></div>
            </div>
            <div className="onboarding-item">
              <div className="onboarding-icon">🤏</div>
              <div className="onboarding-text"><strong>Move</strong><span>Pinch to grab &amp; reposition</span></div>
            </div>
            <div className="onboarding-item">
              <div className="onboarding-icon">✊</div>
              <div className="onboarding-text"><strong>Idle</strong><span>Close fist to rest</span></div>
            </div>
          </div>
          <p className="onboarding-hint">Everything runs locally — no video ever leaves your browser.</p>
          <button className="btn-primary" onClick={startApp}>Let's Go!</button>
        </div>
      </div>

      <div id="camera-error" className={cameraError ? "" : "hidden"}>
        <p>⚠️ CAMERA ACCESS REQUIRED.<br />PLEASE ALLOW CAMERA PERMISSIONS AND RELOAD.</p>
      </div>
    </>
  );
}