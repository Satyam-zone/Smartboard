'use client';

import React, { useState, useRef, useEffect } from 'react';
import katex from 'katex';
import { jsPDF } from 'jspdf';
import 'katex/dist/katex.min.css';
import AIExplanationBox from '../components/AIExplanationBox';

export default function Smartboard() {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // --- Toolbar Expand/Collapse States ---
  const [isNavOpen, setIsNavOpen] = useState(true);
  const [isToolsOpen, setIsToolsOpen] = useState(true);

  // --- Board & Page State ---
  const [boardBg, setBoardBg] = useState('light');
  const [pages, setPages] = useState([{ shapes: [], stickyNotes: [], latexNodes: [], images: [] }]);
  const [currentPage, setCurrentPage] = useState(0);

  // --- Undo / Redo Stacks ---
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // --- Zoom & Pan / Grid Snapping ---
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isGridSnapping, setIsGridSnapping] = useState(false);
  const GRID_SIZE = 32;

  // --- Active Tool State ---
  const [activeTool, setActiveTool] = useState('pen');
  const [selectedShapeType, setSelectedShapeType] = useState('line');
  const [isShapeDropdownOpen, setIsShapeDropdownOpen] = useState(false);
  const [isPenSizeOpen, setIsPenSizeOpen] = useState(false);
  const [isEraserSizeOpen, setIsEraserSizeOpen] = useState(false);

  const [penColor, setPenColor] = useState('#0f172a');
  const [penSize, setPenSize] = useState(4);
  const [eraserSize, setEraserSize] = useState(25);
  const [tool, setTool] = useState('select');

  // --- AI Selection & Assistant Drawer States ---
  const [selectionBox, setSelectionBox] = useState(null);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [selectedCropImage, setSelectedCropImage] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [aiCustomPrompt, setAiCustomPrompt] = useState('');

  // --- Overlay Elements ---
  const [stickyNotes, setStickyNotes] = useState([]);
  const [latexNodes, setLatexNodes] = useState([]);
  const [boardImages, setBoardImages] = useState([]);
  const [latexInput, setLatexInput] = useState('\\int_0^1 x^2 dx = \\frac{1}{3}');
  const [isLatexModalOpen, setIsLatexModalOpen] = useState(false);

  // --- Classroom Utilities ---
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [spotlightPos, setSpotlightPos] = useState({ x: 300, y: 300, radius: 120 });
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  // Swatches
  const colorSwatches = ['#0f172a', '#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff'];

  // Shapes List
  const availableShapes = [
    { id: 'line', label: '📏 Line' },
    { id: 'arrow', label: '🏹 Arrow' },
    { id: 'rect', label: '🔲 Rectangle' },
    { id: 'roundRect', label: '▢ Rounded Rect' },
    { id: 'circle', label: '⭕ Circle' },
    { id: 'triangle', label: '🔺 Triangle' },
    { id: 'diamond', label: '🔷 Diamond' },
    { id: 'star', label: '⭐ Star' },
  ];

  // --- Data Stores ---
  const permanentShapes = useRef([]);
  const isPainting = useRef(false);
  const currentStroke = useRef([]);
  const startPoint = useRef(null);
  const laserTrail = useRef([]);
  const animFrameId = useRef(null);

  // Grid Snapping Helper
  const snapToGrid = (coord) => {
    if (!isGridSnapping) return coord;
    return Math.round(coord / GRID_SIZE) * GRID_SIZE;
  };

  // --- UNDO / REDO LOGIC ---
  const saveStateToUndo = () => {
    setUndoStack((prev) => [...prev, JSON.parse(JSON.stringify(permanentShapes.current))]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previousState = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, JSON.parse(JSON.stringify(permanentShapes.current))]);
    permanentShapes.current = previousState;
    setUndoStack((prev) => prev.slice(0, -1));
    redrawBoard();
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, JSON.parse(JSON.stringify(permanentShapes.current))]);
    permanentShapes.current = nextState;
    setRedoStack((prev) => prev.slice(0, -1));
    redrawBoard();
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack]);

  // --- Timer ---
  useEffect(() => {
    let interval = null;
    if (isTimerRunning) {
      interval = setInterval(() => setTimerSeconds((prev) => prev + 1), 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // --- Image Upload Handler ---
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setBoardImages((prev) => [
          ...prev,
          {
            id: Date.now(),
            src: event.target.result,
            x: 200,
            y: 150,
            width: Math.min(img.width, 400),
            height: Math.min(img.height, 300),
          },
        ]);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // --- Direct PDF Exporting ---
  const exportPDF = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    redrawBoard();

    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [canvas.width, canvas.height],
    });

    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(`Smartboard_Lecture_Page_${currentPage + 1}.pdf`);
  };

  // --- Screen Recording ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStream.getAudioTracks().forEach((track) => stream.addTrack(track));
      } catch (err) {
        console.warn('Microphone muted or unavailable.');
      }

      recordedChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartboard-recording-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setIsRecording(false);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err) {
      console.error('Recording failed:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
  };

  // --- Canvas Resize & Setup ---
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      redrawBoard();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTool, penColor, penSize, eraserSize, boardBg, zoomLevel, panOffset]);

  // --- Animation Loop ---
  useEffect(() => {
    const renderLoop = () => {
      if (activeTool === 'laser' || laserTrail.current.length > 0 || activeTool === 'spotlight') {
        const now = Date.now();
        laserTrail.current = laserTrail.current.filter((p) => now - p.time < 400);
        redrawBoard();
      }
      animFrameId.current = requestAnimationFrame(renderLoop);
    };

    animFrameId.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animFrameId.current);
  }, [activeTool, boardBg, spotlightPos, zoomLevel, panOffset, selectionBox]);

  const getCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    const xOnCanvas = clientX - rect.left;
    const yOnCanvas = clientY - rect.top;

    const rawX = (xOnCanvas - panOffset.x) / zoomLevel;
    const rawY = (yOnCanvas - panOffset.y) / zoomLevel;

    return { x: rawX, y: rawY };
  };

  // Slide Switching
  const switchPage = (newIdx) => {
    const updatedPages = [...pages];
    updatedPages[currentPage] = {
      shapes: [...permanentShapes.current],
      stickyNotes: [...stickyNotes],
      latexNodes: [...latexNodes],
      images: [...boardImages],
    };

    if (newIdx >= updatedPages.length) {
      updatedPages.push({ shapes: [], stickyNotes: [], latexNodes: [], images: [] });
    }

    setPages(updatedPages);
    setCurrentPage(newIdx);

    permanentShapes.current = updatedPages[newIdx].shapes || [];
    setStickyNotes(updatedPages[newIdx].stickyNotes || []);
    setLatexNodes(updatedPages[newIdx].latexNodes || []);
    setBoardImages(updatedPages[newIdx].images || []);
    setUndoStack([]);
    setRedoStack([]);
    setSelectionBox(null);
    setIsAiDrawerOpen(false);
    redrawBoard();
  };

  // Background Renderer
  const renderBackground = (ctx, w, h) => {
    ctx.save();
    if (boardBg === 'dark') {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(-panOffset.x / zoomLevel, -panOffset.y / zoomLevel, w / zoomLevel, h / zoomLevel);
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-panOffset.x / zoomLevel, -panOffset.y / zoomLevel, w / zoomLevel, h / zoomLevel);
    }

    if (boardBg === 'grid') {
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1 / zoomLevel;
      const step = GRID_SIZE;
      ctx.beginPath();
      for (let x = -1000; x < w * 2; x += step) { ctx.moveTo(x, -1000); ctx.lineTo(x, h * 2); }
      for (let y = -1000; y < h * 2; y += step) { ctx.moveTo(-1000, y); ctx.lineTo(w * 2, y); }
      ctx.stroke();
    } else if (boardBg === 'ruled') {
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1 / zoomLevel;
      const step = 36;
      ctx.beginPath();
      for (let y = -1000; y < h * 2; y += step) { ctx.moveTo(-1000, y); ctx.lineTo(w * 2, y); }
      ctx.stroke();
    }
    ctx.restore();
  };

  // Main Canvas Redraw
  const redrawBoard = (previewShape = null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    ctx.scale(dpr * zoomLevel, dpr * zoomLevel);
    ctx.translate(panOffset.x, panOffset.y);

    renderBackground(ctx, canvas.width / dpr, canvas.height / dpr);

    permanentShapes.current.forEach((s) => drawSingleShape(ctx, s));

    if (previewShape) drawSingleShape(ctx, previewShape);

    if (selectionBox) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2 / zoomLevel;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
      ctx.fillRect(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h);
      ctx.restore();
    }

    if (laserTrail.current.length > 0) {
      const now = Date.now();
      ctx.save();
      for (let i = 0; i < laserTrail.current.length; i++) {
        const pt = laserTrail.current[i];
        const age = now - pt.time;
        const alpha = Math.max(0, 1 - age / 400);

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 7 * alpha, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 12;
        ctx.fill();
      }
      ctx.restore();
    }

    if (activeTool === 'spotlight') {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.beginPath();
      ctx.rect(-1000, -1000, 4000, 4000);
      ctx.arc(spotlightPos.x, spotlightPos.y, spotlightPos.radius, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.restore();
    }

    ctx.restore();
  };

  const drawSingleShape = (context, shape) => {
    context.save();
    context.beginPath();
    context.strokeStyle = shape.color;
    context.fillStyle = shape.color;
    context.lineWidth = shape.size;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    switch (shape.type) {
      case 'stroke':
        if (shape.points.length < 2) break;
        context.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
          context.lineTo(shape.points[i].x, shape.points[i].y);
        }
        context.stroke();
        break;
      case 'line':
        context.moveTo(shape.start.x, shape.start.y);
        context.lineTo(shape.end.x, shape.end.y);
        context.stroke();
        break;
      case 'arrow':
        {
          const headlen = 16;
          const dx = shape.end.x - shape.start.x;
          const dy = shape.end.y - shape.start.y;
          const angle = Math.atan2(dy, dx);
          context.moveTo(shape.start.x, shape.start.y);
          context.lineTo(shape.end.x, shape.end.y);
          context.stroke();
          context.beginPath();
          context.moveTo(shape.end.x, shape.end.y);
          context.lineTo(shape.end.x - headlen * Math.cos(angle - Math.PI / 6), shape.end.y - headlen * Math.sin(angle - Math.PI / 6));
          context.lineTo(shape.end.x - headlen * Math.cos(angle + Math.PI / 6), shape.end.y - headlen * Math.sin(angle + Math.PI / 6));
          context.closePath();
          context.fill();
        }
        break;
      case 'rect':
        context.strokeRect(shape.x, shape.y, shape.w, shape.h);
        break;
      case 'roundRect':
        context.roundRect(shape.x, shape.y, shape.w, shape.h, 12);
        context.stroke();
        break;
      case 'circle':
        context.arc(shape.start.x, shape.start.y, shape.radius, 0, 2 * Math.PI);
        context.stroke();
        break;
      case 'triangle':
        context.moveTo(shape.x + shape.w / 2, shape.y);
        context.lineTo(shape.x, shape.y + shape.h);
        context.lineTo(shape.x + shape.w, shape.y + shape.h);
        context.closePath();
        context.stroke();
        break;
      case 'diamond':
        context.moveTo(shape.x + shape.w / 2, shape.y);
        context.lineTo(shape.x + shape.w, shape.y + shape.h / 2);
        context.lineTo(shape.x + shape.w / 2, shape.y + shape.h);
        context.lineTo(shape.x, shape.y + shape.h / 2);
        context.closePath();
        context.stroke();
        break;
      case 'star':
        {
          const cx = shape.x + shape.w / 2;
          const cy = shape.y + shape.h / 2;
          const outerR = Math.min(shape.w, shape.h) / 2;
          const innerR = outerR / 2;
          context.beginPath();
          for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const a = (i * Math.PI) / 5 - Math.PI / 2;
            context.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
          }
          context.closePath();
          context.stroke();
        }
        break;
    }
    context.restore();
  };

  const cropSelectedCanvasArea = (box) => {
    const canvas = canvasRef.current;
    if (!canvas || box.w < 10 || box.h < 10) return null;

    const dpr = window.devicePixelRatio || 1;
    const cropCanvas = document.createElement('canvas');
    const cropCtx = cropCanvas.getContext('2d');

    const realX = (box.x + panOffset.x) * zoomLevel * dpr;
    const realY = (box.y + panOffset.y) * zoomLevel * dpr;
    const realW = box.w * zoomLevel * dpr;
    const realH = box.h * zoomLevel * dpr;

    cropCanvas.width = realW;
    cropCanvas.height = realH;

    cropCtx.drawImage(
      canvas,
      realX, realY, realW, realH,
      0, 0, realW, realH
    );

    return cropCanvas.toDataURL('image/png');
  };

  const runAiAnalysis = async (taskType = 'explain_math') => {
    if (!selectedCropImage) return;

    setAiLoading(true);
    setAiResponse('');

    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: selectedCropImage,
          userPrompt: aiCustomPrompt,
          taskType,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setAiResponse(`⚠️ Error: ${data.error}`);
      } else {
        setAiResponse(data.result);
      }
    } catch (err) {
      setAiResponse('⚠️ Failed to connect to AI assistant.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleStrokeEraserAt = (pt) => {
    saveStateToUndo();
    permanentShapes.current = permanentShapes.current.filter((shape) => {
      if (shape.type === 'stroke') {
        return !shape.points.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < eraserSize);
      } else if (shape.x !== undefined) {
        return !(pt.x >= shape.x && pt.x <= shape.x + shape.w && pt.y >= shape.y && pt.y <= shape.y + shape.h);
      }
      return true;
    });
    redrawBoard();
  };

  const handleManualDusterAt = (pt) => {
    let newShapes = [];
    saveStateToUndo();

    permanentShapes.current.forEach((shape) => {
      if (shape.type === 'stroke') {
        let currentSegment = [];
        shape.points.forEach((p) => {
          const dist = Math.hypot(p.x - pt.x, p.y - pt.y);
          if (dist > eraserSize) {
            currentSegment.push(p);
          } else {
            if (currentSegment.length > 1) {
              newShapes.push({ ...shape, points: currentSegment });
            }
            currentSegment = [];
          }
        });
        if (currentSegment.length > 1) {
          newShapes.push({ ...shape, points: currentSegment });
        }
      } else {
        newShapes.push(shape);
      }
    });

    permanentShapes.current = newShapes;
    redrawBoard();
  };

  // Pointer Handlers
  const handlePointerDown = (e) => {
    setIsShapeDropdownOpen(false);
    setIsPenSizeOpen(false);
    setIsEraserSizeOpen(false);

    isPainting.current = true;
    let pt = getCoords(e);

    if (isGridSnapping && activeTool === 'shape') {
      pt = { x: snapToGrid(pt.x), y: snapToGrid(pt.y) };
    }

    startPoint.current = pt;

    if (activeTool === 'select') {
      setSelectionBox({ x: pt.x, y: pt.y, w: 0, h: 0 });
      return;
    }

    if (activeTool === 'spotlight') {
      setSpotlightPos((prev) => ({ ...prev, x: pt.x, y: pt.y }));
      return;
    }

    if (activeTool === 'laser') {
      laserTrail.current.push({ x: pt.x, y: pt.y, time: Date.now() });
      return;
    }

    if (activeTool === 'strokeEraser') {
      handleStrokeEraserAt(pt);
      return;
    }

    if (activeTool === 'manualEraser') {
      handleManualDusterAt(pt);
      return;
    }

    if (activeTool === 'sticky') {
      setStickyNotes((prev) => [
        ...prev,
        { id: Date.now(), x: pt.x, y: pt.y, text: 'Click to edit note...', color: '#fef08a' },
      ]);
      setActiveTool('pen');
      return;
    }

    if (activeTool === 'pen') {
      saveStateToUndo();
      currentStroke.current = [pt];
    }
  };

  const handlePointerMove = (e) => {
    if (!isPainting.current && activeTool !== 'laser' && activeTool !== 'spotlight') return;

    let pt = getCoords(e);

    if (isGridSnapping && activeTool === 'shape') {
      pt = { x: snapToGrid(pt.x), y: snapToGrid(pt.y) };
    }

    if (activeTool === 'select' && startPoint.current) {
      const x = Math.min(startPoint.current.x, pt.x);
      const y = Math.min(startPoint.current.y, pt.y);
      const w = Math.abs(pt.x - startPoint.current.x);
      const h = Math.abs(pt.y - startPoint.current.y);
      setSelectionBox({ x, y, w, h });
      redrawBoard();
      return;
    }

    if (activeTool === 'spotlight') {
      setSpotlightPos((prev) => ({ ...prev, x: pt.x, y: pt.y }));
      return;
    }

    if (activeTool === 'laser') {
      laserTrail.current.push({ x: pt.x, y: pt.y, time: Date.now() });
      return;
    }

    if (activeTool === 'strokeEraser') {
      handleStrokeEraserAt(pt);
      return;
    }

    if (activeTool === 'manualEraser') {
      handleManualDusterAt(pt);
      return;
    }

    if (activeTool === 'pen') {
      currentStroke.current.push(pt);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const len = currentStroke.current.length;

        if (len >= 2) {
          const p1 = currentStroke.current[len - 2];
          const p2 = currentStroke.current[len - 1];

          ctx.save();
          ctx.scale(dpr * zoomLevel, dpr * zoomLevel);
          ctx.translate(panOffset.x, panOffset.y);

          ctx.beginPath();
          ctx.strokeStyle = penColor;
          ctx.lineWidth = penSize;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          ctx.restore();
        }
      }
    } else if (activeTool === 'shape') {
      const x = Math.min(startPoint.current.x, pt.x);
      const y = Math.min(startPoint.current.y, pt.y);
      const w = Math.abs(pt.x - startPoint.current.x);
      const h = Math.abs(pt.y - startPoint.current.y);

      let preview = {
        type: selectedShapeType,
        start: startPoint.current,
        end: pt,
        x, y, w, h,
        radius: Math.hypot(pt.x - startPoint.current.x, pt.y - startPoint.current.y),
        color: penColor,
        size: penSize,
      };
      redrawBoard(preview);
    }
  };

  const handlePointerUp = (e) => {
    if (!isPainting.current) return;
    isPainting.current = false;
    let pt = getCoords(e);

    if (isGridSnapping && activeTool === 'shape') {
      pt = { x: snapToGrid(pt.x), y: snapToGrid(pt.y) };
    }

    if (activeTool === 'select' && selectionBox && selectionBox.w > 15 && selectionBox.h > 15) {
      const croppedBase64 = cropSelectedCanvasArea(selectionBox);
      if (croppedBase64) {
        setSelectedCropImage(croppedBase64);
        setIsAiDrawerOpen(true);
        setAiResponse('');
      }
    } else if (activeTool === 'pen' && currentStroke.current.length > 1) {
      permanentShapes.current.push({
        type: 'stroke',
        points: [...currentStroke.current],
        color: penColor,
        size: penSize,
      });
    } else if (activeTool === 'shape') {
      saveStateToUndo();
      permanentShapes.current.push({
        type: selectedShapeType,
        start: startPoint.current,
        end: pt,
        x: Math.min(startPoint.current.x, pt.x),
        y: Math.min(startPoint.current.y, pt.y),
        w: Math.abs(pt.x - startPoint.current.x),
        h: Math.abs(pt.y - startPoint.current.y),
        radius: Math.hypot(pt.x - startPoint.current.x, pt.y - startPoint.current.y),
        color: penColor,
        size: penSize,
      });
    }

    currentStroke.current = [];
    redrawBoard();
  };

  const handleAddLatex = () => {
    if (!latexInput.trim()) return;
    try {
      const html = katex.renderToString(latexInput, { throwOnError: false });
      setLatexNodes((prev) => [...prev, { id: Date.now(), x: 200, y: 200, latex: latexInput, html }]);
      setIsLatexModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none touch-none font-sans antialiased">
      
      {/* Hidden File Input for Image Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Floating Header Bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 w-11/12 max-w-6xl transition-all">
        {isNavOpen ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 text-white rounded-2xl shadow-2xl w-full">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1 rounded-xl text-xs font-bold shadow-md">
                <span>✦ SMARTBOARD</span>
              </div>

              {/* Undo / Redo Buttons */}
              <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/50">
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-lg font-bold flex items-center gap-1 transition"
                  title="Undo (Ctrl+Z)"
                >
                  ↩ Undo
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-lg font-bold flex items-center gap-1 transition"
                  title="Redo (Ctrl+Y)"
                >
                  ↪ Redo
                </button>
              </div>

              {/* Slide Navigation */}
              <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/50">
                <button
                  onClick={() => switchPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-lg font-medium"
                >
                  ◀
                </button>
                <span className="px-2 text-xs font-semibold text-slate-300">
                  {currentPage + 1} / {pages.length}
                </span>
                <button
                  onClick={() => switchPage(currentPage + 1)}
                  className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold text-white shadow-sm"
                >
                  + Slide
                </button>
              </div>
            </div>

            {/* Timer, Zoom, Recorder & Import Image Controls */}
            <div className="flex items-center gap-2 bg-slate-800/60 p-1 rounded-xl border border-slate-700/40 text-xs">
              
              {/* Zoom Controls */}
              <div className="flex items-center gap-1 px-1">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(0.4, z - 0.1))}
                  className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center font-bold"
                >
                  -
                </button>
                <span className="text-[11px] font-mono font-semibold w-11 text-center text-slate-300">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(3.0, z + 0.1))}
                  className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center font-bold"
                >
                  +
                </button>
                <button
                  onClick={() => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
                  className="px-1.5 py-0.5 text-[10px] bg-slate-700 hover:bg-slate-600 rounded text-slate-400"
                >
                  Reset
                </button>
              </div>

              <div className="h-4 w-[1px] bg-slate-700 mx-0.5" />

              {/* Import Image Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg border border-emerald-500/30 flex items-center gap-1 transition"
              >
                🖼️ Import Image
              </button>

              <div className="h-4 w-[1px] bg-slate-700 mx-0.5" />

              {/* Timer Controls */}
              <div className="flex items-center gap-1.5 px-1.5">
                <span className="font-mono font-bold text-amber-400">{formatTimer(timerSeconds)}</span>
                <button
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-[10px] font-bold"
                >
                  {isTimerRunning ? 'Pause' : 'Start'}
                </button>
                <button
                  onClick={() => { setIsTimerRunning(false); setTimerSeconds(0); }}
                  className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-[10px] text-slate-300"
                >
                  Reset
                </button>
              </div>

              <div className="h-4 w-[1px] bg-slate-700 mx-0.5" />

              {/* Recorder */}
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-1 px-2.5 py-1 bg-red-600/80 hover:bg-red-500 rounded-lg font-bold text-white transition text-xs"
                >
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Record
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-slate-950 transition text-xs"
                >
                  ⏹ Stop Recording
                </button>
              )}
            </div>

            {/* Direct Export PDF */}
            <div className="flex items-center gap-2">
              <button
                onClick={exportPDF}
                className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 rounded-xl font-bold text-white shadow-md transition flex items-center gap-1"
              >
                📄 Direct PDF
              </button>
              <button
                onClick={() => setIsNavOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl border border-slate-700 transition"
              >
                ◀
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsNavOpen(true)}
            className="self-start flex items-center gap-2 px-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-xl text-xs font-bold text-white shadow-xl"
          >
            <span>✦ SMARTBOARD</span>
            <span className="text-slate-400">▶ Open Header</span>
          </button>
        )}

        {/* BOTTOM TOOLBAR */}
        {isToolsOpen ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-slate-900/90 backdrop-blur-2xl border border-slate-700/50 rounded-2xl shadow-2xl w-full">
            {/* Tools List */}
            <div className="flex items-center gap-1 bg-slate-800/40 p-1 rounded-xl border border-slate-700/30">
              
              {/* AI SELECTION TOOL */}
              <button
                onClick={() => {
                  setActiveTool('select');
                  setIsPenSizeOpen(false);
                  setIsEraserSizeOpen(false);
                  setIsShapeDropdownOpen(false);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition ${
                  activeTool === 'select'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                    : 'text-blue-400 hover:bg-slate-800'
                }`}
              >
                <span>🔍 Select & Ask AI</span>
              </button>

              <div className="h-4 w-[1px] bg-slate-700 mx-1" />

              {/* PEN BUTTON */}
              <div className="relative">
                <button
                  onClick={() => {
                    setActiveTool('pen');
                    setIsPenSizeOpen(!isPenSizeOpen);
                    setIsEraserSizeOpen(false);
                    setIsShapeDropdownOpen(false);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 ${
                    activeTool === 'pen' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>✏️ Pen</span>
                  <span className="text-[10px] bg-black/30 px-1.5 py-0.5 rounded font-mono">{penSize}px</span>
                </button>

                {isPenSizeOpen && (
                  <div className="absolute top-full left-0 mt-2 p-3 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col items-center gap-2 z-50">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Thickness</span>
                    <div className="h-32 flex items-center justify-center my-1">
                      <input
                        type="range"
                        min="1"
                        max="40"
                        value={penSize}
                        onChange={(e) => setPenSize(Number(e.target.value))}
                        className="h-28 accent-blue-500 cursor-pointer"
                        style={{ writingMode: 'bt-lr', appearance: 'slider-vertical' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ERASER BUTTON */}
              <div className="relative">
                <button
                  onClick={() => {
                    setActiveTool('manualEraser');
                    setIsEraserSizeOpen(!isEraserSizeOpen);
                    setIsPenSizeOpen(false);
                    setIsShapeDropdownOpen(false);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 ${
                    activeTool === 'manualEraser' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>🖐️ Manual Duster</span>
                  <span className="text-[10px] bg-black/30 px-1.5 py-0.5 rounded font-mono">{eraserSize}px</span>
                </button>

                {isEraserSizeOpen && (
                  <div className="absolute top-full left-0 mt-2 p-3 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col items-center gap-2 z-50">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duster Size</span>
                    <div className="h-32 flex items-center justify-center my-1">
                      <input
                        type="range"
                        min="5"
                        max="100"
                        value={eraserSize}
                        onChange={(e) => setEraserSize(Number(e.target.value))}
                        className="h-28 accent-amber-500 cursor-pointer"
                        style={{ writingMode: 'bt-lr', appearance: 'slider-vertical' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Tap Delete Button */}
              <button
                onClick={() => {
                  setActiveTool('strokeEraser');
                  setIsPenSizeOpen(false);
                  setIsEraserSizeOpen(false);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  activeTool === 'strokeEraser' ? 'bg-rose-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                💥 Tap Delete
              </button>

              {/* Shape Selection Dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setActiveTool('shape');
                    setIsShapeDropdownOpen(!isShapeDropdownOpen);
                    setIsPenSizeOpen(false);
                    setIsEraserSizeOpen(false);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 ${
                    activeTool === 'shape' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>{availableShapes.find((s) => s.id === selectedShapeType)?.label || 'Shapes'}</span>
                  <span>▼</span>
                </button>

                {isShapeDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 p-1">
                    {availableShapes.map((shape) => (
                      <button
                        key={shape.id}
                        onClick={() => {
                          setSelectedShapeType(shape.id);
                          setActiveTool('shape');
                          setIsShapeDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 rounded-lg flex items-center justify-between"
                      >
                        <span>{shape.label}</span>
                        {selectedShapeType === shape.id && <span className="text-blue-400 font-bold">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Grid Snapping Toggle */}
              <button
                onClick={() => setIsGridSnapping(!isGridSnapping)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  isGridSnapping ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-800'
                }`}
                title="Automatically snap shapes to grid lines"
              >
                🧲 Snap Grid: {isGridSnapping ? 'ON' : 'OFF'}
              </button>

              <button
                onClick={() => setActiveTool('sticky')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  activeTool === 'sticky' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                📌 Sticky
              </button>

              <button
                onClick={() => setIsLatexModalOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-300 hover:bg-slate-800"
              >
                ∑ Math
              </button>

              <button
                onClick={() => setActiveTool('spotlight')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  activeTool === 'spotlight' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                🔦 Torch
              </button>

              <button
                onClick={() => setActiveTool('laser')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  activeTool === 'laser' ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                Laser
              </button>
            </div>

            {/* Select & Move Tool Button */}
<button
  onClick={() => setTool('select')}
  className={`p-2.5 rounded-xl transition-all ${
    tool === 'select'
      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
      : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
  }`}
  title="Select & Move"
>
  {/* Mouse Cursor Icon */}
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"
    />
  </svg>
</button>

            {/* Colors Swatches */}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/40 rounded-xl border border-slate-700/30">
              {colorSwatches.map((c) => (
                <button
                  key={c}
                  onClick={() => setPenColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-full border border-white/20 ${
                    penColor === c ? 'ring-2 ring-blue-500 scale-110' : 'opacity-80'
                  }`}
                />
              ))}
            </div>

            {/* Clear & Collapse */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  saveStateToUndo();
                  permanentShapes.current = [];
                  setStickyNotes([]);
                  setLatexNodes([]);
                  setBoardImages([]);
                  setSelectionBox(null);
                  setIsAiDrawerOpen(false);
                  redrawBoard();
                }}
                className="px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 rounded-xl border border-rose-500/30"
              >
                Clear Board
              </button>
              <button
                onClick={() => setIsToolsOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl border border-slate-700"
              >
                ◀
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsToolsOpen(true)}
            className="self-start flex items-center gap-2 px-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-xl text-xs font-bold text-white shadow-xl"
          >
            <span>🛠️ TOOLS ({activeTool.toUpperCase()})</span>
            <span className="text-slate-400">▶ Open Toolbar</span>
          </button>
        )}
      </div>

      {/* AI ASSISTANT SIDE DRAWER */}
      {isAiDrawerOpen && (
        <div className="absolute top-0 right-0 h-full w-96 bg-slate-900/95 backdrop-blur-2xl border-l border-slate-800 shadow-2xl z-50 flex flex-col p-5 text-white animate-in slide-in-from-right duration-300">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xl">🤖</span>
              <h2 className="font-bold text-sm bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                AI Study Assistant
              </h2>
            </div>
            <button
              onClick={() => {
                setIsAiDrawerOpen(false);
                setSelectionBox(null);
                redrawBoard();
              }}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 text-xs"
            >
              ✕ Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {/* Selected Crop Preview */}
            {selectedCropImage && (
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex flex-col items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 self-start">
                  Selected Area Snapshot
                </span>
                <img
                  src={selectedCropImage}
                  alt="Selection preview"
                  className="max-h-36 object-contain rounded border border-slate-700"
                />
              </div>
            )}

            {/* AI Action Mode Buttons */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Choose AI Task</span>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => runAiAnalysis('explain_math')}
                  disabled={aiLoading}
                  className="w-full text-left p-2.5 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 rounded-xl text-xs font-semibold text-blue-300 flex items-center justify-between transition disabled:opacity-50"
                >
                  <span>🔍 Math Error Solver & Hint</span>
                  <span>➔</span>
                </button>
                <button
                  onClick={() => runAiAnalysis('beautify')}
                  disabled={aiLoading}
                  className="w-full text-left p-2.5 bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 rounded-xl text-xs font-semibold text-purple-300 flex items-center justify-between transition disabled:opacity-50"
                >
                  <span>✨ Beautify & Transcribe</span>
                  <span>➔</span>
                </button>
                <button
                  onClick={() => runAiAnalysis('format_code')}
                  disabled={aiLoading}
                  className="w-full text-left p-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 rounded-xl text-xs font-semibold text-emerald-300 flex items-center justify-between transition disabled:opacity-50"
                >
                  <span>💻 Format Code (Indentation)</span>
                  <span>➔</span>
                </button>
              </div>
            </div>

            {/* Custom Question Input */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Ask Custom Question</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g., Explain this formula..."
                  value={aiCustomPrompt}
                  onChange={(e) => setAiCustomPrompt(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => runAiAnalysis('custom')}
                  disabled={aiLoading}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  Ask
                </button>
              </div>
            </div>

            {/* AI Output Display */}
           {/* AI Output Display */}
{aiLoading ? (
  <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 flex flex-col items-center justify-center gap-3 py-8">
    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    <span className="text-xs text-slate-400 animate-pulse">Analyzing canvas selection...</span>
  </div>
) : aiResponse ? (
  <div className="rounded-2xl overflow-hidden border border-slate-800">
    <AIExplanationBox aiResult={aiResponse} />
  </div>
) : null}
          </div>
        </div>
      )}

      {/* Imported Annotatable Images Layer */}
      {boardImages.map((img) => (
        <div
          key={img.id}
          style={{ top: img.y, left: img.x, width: img.width, height: img.height }}
          className="absolute z-20 group rounded-xl border-2 border-dashed border-blue-500/40 hover:border-blue-500 p-1 bg-slate-900/30 backdrop-blur-xs cursor-move shadow-2xl"
        >
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition flex items-center gap-1 z-30">
            <button
              onClick={() => setBoardImages((prev) => prev.filter((i) => i.id !== img.id))}
              className="p-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow"
            >
              ✕ Delete
            </button>
          </div>
          <img
            src={img.src}
            alt="Uploaded diagram"
            className="w-full h-full object-contain rounded-lg pointer-events-none"
          />
        </div>
      ))}

      {/* Sticky Notes */}
      {stickyNotes.map((note) => (
        <div
          key={note.id}
          style={{ top: note.y, left: note.x, backgroundColor: note.color }}
          className="absolute z-30 p-3 w-48 h-48 rounded-xl shadow-2xl flex flex-col border border-black/10 cursor-move"
        >
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-bold text-black/40 uppercase tracking-wider">Sticky Note</span>
            <button
              onClick={() => setStickyNotes((prev) => prev.filter((n) => n.id !== note.id))}
              className="text-black/50 hover:text-black font-bold text-xs"
            >
              ✕
            </button>
          </div>
          <textarea
            value={note.text}
            onChange={(e) => {
              const val = e.target.value;
              setStickyNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, text: val } : n)));
            }}
            className="w-full h-full bg-transparent resize-none outline-none text-slate-900 font-medium text-xs leading-relaxed"
          />
        </div>
      ))}

      {/* Rendered Math LaTeX Overlay */}
      {latexNodes.map((node) => (
        <div
          key={node.id}
          style={{ top: node.y, left: node.x }}
          className="absolute z-30 p-3 bg-slate-900/90 border border-slate-700 text-white rounded-xl shadow-2xl flex items-center gap-3 cursor-move"
        >
          <div dangerouslySetInnerHTML={{ __html: node.html }} className="text-lg" />
          <button
            onClick={() => setLatexNodes((prev) => prev.filter((n) => n.id !== node.id))}
            className="text-slate-400 hover:text-rose-400 font-bold text-xs"
          >
            ✕
          </button>
        </div>
      ))}

      {/* LaTeX Modal */}
      {isLatexModalOpen && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-md text-white shadow-2xl">
            <h3 className="font-bold text-sm mb-3">Insert LaTeX Equation</h3>
            <textarea
              value={latexInput}
              onChange={(e) => setLatexInput(e.target.value)}
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 font-mono text-xs text-blue-300 outline-none mb-3"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsLatexModalOpen(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">
                Cancel
              </button>
              <button onClick={handleAddLatex} className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 font-bold rounded-xl">
                Insert Formula
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Drawing Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ touchAction: 'none' }}
        className="absolute top-0 left-0 w-full h-full cursor-crosshair z-10"
      />
    </div>
  );
}