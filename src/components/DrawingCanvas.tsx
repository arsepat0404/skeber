import { useEffect, useRef, useState, useCallback } from "react";
import { Pencil, Eraser, Undo2, Trash2, Droplet, Settings2, Square, Circle, Triangle, Pentagon, Hexagon, Star } from "lucide-react";

interface Props {
  onChange?: (dataUrl: string) => void;
  width?: number;
  height?: number;
}

const COLORS: { hex: string; name: string }[] = [
  { hex: "#000000", name: "Hitam" },
  { hex: "#FFFFFF", name: "Putih" },
  { hex: "#1B4332", name: "Hijau Hutan" },
  { hex: "#FFFF00", name: "Kuning" },
  { hex: "#FF3B30", name: "Merah" },
  { hex: "#FF9500", name: "Oranye" },
  { hex: "#34C759", name: "Hijau" },
  { hex: "#0A84FF", name: "Biru" },
  { hex: "#AF52DE", name: "Ungu" },
  { hex: "#FF2D92", name: "Pink" },
  { hex: "#8B4513", name: "Coklat" },
  { hex: "#5AC8FA", name: "Biru Muda" },
];

type ShapeKind = "rect" | "circle" | "triangle" | "pentagon" | "hexagon" | "star";
type Tool = "pencil" | "eraser" | ShapeKind;

interface Stroke {
  tool: Tool;
  color: string;
  size: number;
  opacity: number;
  smoothing: number;
  points: { x: number; y: number }[];
  filled?: boolean;
}

const SETTINGS_KEY = "sb_canvas_settings";
interface CanvasSettings { sensitivity: number; smoothing: number; }
function loadSettings(): CanvasSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { sensitivity: 0.8, smoothing: 0.5, ...JSON.parse(raw) };
  } catch {}
  return { sensitivity: 0.8, smoothing: 0.5 };
}
function saveSettings(s: CanvasSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

export function DrawingCanvas({ onChange, width = 800, height = 800 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const rafRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);

  const [, force] = useState(0);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState<string>("#000000");
  const [size, setSize] = useState<number>(5);
  const [opacity, setOpacity] = useState<number>(1);
  const [showSettings, setShowSettings] = useState(false);
  const [filled, setFilled] = useState<boolean>(false);

  const initial = loadSettings();
  // sensitivity: minimum distance between captured points (lower = more sensitive)
  const [sensitivity, setSensitivity] = useState<number>(initial.sensitivity);
  // smoothing: 0 = raw lines, 1 = max curve smoothing
  const [smoothing, setSmoothing] = useState<number>(initial.smoothing);

  useEffect(() => {
    saveSettings({ sensitivity, smoothing });
  }, [sensitivity, smoothing]);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, s: Stroke) => {
    const pts = s.points;
    if (pts.length === 0) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = s.size;
    ctx.globalAlpha = s.tool === "eraser" ? 1 : s.opacity;
    ctx.strokeStyle = s.tool === "eraser" ? "#FFFFFF" : s.color;
    ctx.fillStyle = ctx.strokeStyle;

    // Shape tools: use first + last point to define bounding box
    const isShape = s.tool !== "pencil" && s.tool !== "eraser";
    if (isShape) {
      const a = pts[0];
      const b = pts[pts.length - 1];
      const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
      const x2 = Math.max(a.x, b.x), y2 = Math.max(a.y, b.y);
      const w = x2 - x1, h = y2 - y1;
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const rx = w / 2, ry = h / 2;
      ctx.beginPath();
      if (s.tool === "rect") {
        ctx.rect(x1, y1, w, h);
      } else if (s.tool === "circle") {
        ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      } else {
        // regular polygon / star centered in bbox
        const sides = s.tool === "triangle" ? 3 : s.tool === "pentagon" ? 5 : s.tool === "hexagon" ? 6 : 5;
        const isStar = s.tool === "star";
        const points = isStar ? 10 : sides;
        for (let i = 0; i < points; i++) {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / points;
          const r = isStar && i % 2 === 1 ? 0.5 : 1;
          const x = cx + Math.cos(angle) * rx * r;
          const y = cy + Math.sin(angle) * ry * r;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
      if (s.filled) ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, s.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.smoothing < 0.15 || pts.length === 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
    ctx.restore();
  }, []);

  const redraw = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    for (const s of strokesRef.current) drawStroke(ctx, s);
    if (currentRef.current) drawStroke(ctx, currentRef.current);
    if (onChange) onChange(cvs.toDataURL("image/png"));
  }, [drawStroke, onChange]);

  useEffect(() => { redraw(); }, [redraw]);

  function scheduleDraw() {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (dirtyRef.current) {
        dirtyRef.current = false;
        redraw();
      }
    });
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const cvs = canvasRef.current!;
    const rect = cvs.getBoundingClientRect();
    const pos = {
      x: ((e.clientX - rect.left) / rect.width) * cvs.width,
      y: ((e.clientY - rect.top) / rect.height) * cvs.height,
    };
    currentRef.current = {
      tool,
      color,
      size: tool === "eraser" ? size * 2.5 : size,
      opacity,
      smoothing,
      points: [pos],
      filled,
    };
    dirtyRef.current = true;
    scheduleDraw();
  }
  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!currentRef.current) return;
    e.preventDefault();
    const events = (e.nativeEvent as any).getCoalescedEvents
      ? (e.nativeEvent as any).getCoalescedEvents()
      : [e.nativeEvent];
    const cvs = canvasRef.current!;
    const rect = cvs.getBoundingClientRect();
    const pts = currentRef.current.points;
    const minDist = sensitivity; // 0.2 (very sensitive) - 4 (less)
    for (const ev of events) {
      const x = ((ev.clientX - rect.left) / rect.width) * cvs.width;
      const y = ((ev.clientY - rect.top) / rect.height) * cvs.height;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(x - last.x, y - last.y) > minDist) {
        pts.push({ x, y });
      }
    }
    dirtyRef.current = true;
    scheduleDraw();
  }
  function handleUp() {
    if (!currentRef.current) return;
    strokesRef.current.push(currentRef.current);
    currentRef.current = null;
    dirtyRef.current = true;
    scheduleDraw();
  }
  function undo() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    redraw();
    force((n) => n + 1);
  }
  function clearAll() {
    strokesRef.current = [];
    currentRef.current = null;
    redraw();
    force((n) => n + 1);
  }

  const sizes = [3, 6, 12, 20];

  return (
    <div className="flex flex-col gap-3 w-full">
      <div
        className="w-full bg-white rounded-2xl overflow-hidden border-4 border-primary shadow-lg"
        style={{ aspectRatio: "1 / 1" }}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="ink-canvas w-full h-full block"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onPointerLeave={handleUp}
        />
      </div>

      {/* Toolbar with text labels */}
      <div className="flex flex-wrap items-center gap-2 bg-card rounded-xl p-2 border border-border">
        <ToolBtn active={tool === "pencil"} onClick={() => setTool("pencil")} label="Pensil">
          <Pencil className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn active={tool === "eraser"} onClick={() => setTool("eraser")} label="Hapus">
          <Eraser className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={undo} label="Urungkan">
          <Undo2 className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={clearAll} label="Bersihkan">
          <Trash2 className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => setShowSettings((v) => !v)} active={showSettings} label="Atur">
          <Settings2 className="w-4 h-4" />
        </ToolBtn>
      </div>

      {/* Shape tools */}
      <div className="flex flex-wrap items-center gap-2 bg-card rounded-xl p-2 border border-border">
        <span className="text-xs text-foreground/80 px-1">Bentuk:</span>
        <ToolBtn active={tool === "rect"} onClick={() => setTool("rect")} label="Persegi">
          <Square className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn active={tool === "circle"} onClick={() => setTool("circle")} label="Lingkaran">
          <Circle className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn active={tool === "triangle"} onClick={() => setTool("triangle")} label="Segitiga">
          <Triangle className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn active={tool === "pentagon"} onClick={() => setTool("pentagon")} label="Segilima">
          <Pentagon className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn active={tool === "hexagon"} onClick={() => setTool("hexagon")} label="Segienam">
          <Hexagon className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn active={tool === "star"} onClick={() => setTool("star")} label="Bintang">
          <Star className="w-4 h-4" />
        </ToolBtn>
        <button
          onClick={() => setFilled((v) => !v)}
          className={`h-9 px-3 rounded-lg text-xs font-medium transition ${filled ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}
          aria-label="Isi bentuk"
        >
          {filled ? "Isi: Penuh" : "Isi: Garis"}
        </button>
      </div>

      {/* Brush sizes labeled */}
      <div className="flex items-center gap-2 bg-card rounded-xl p-2 border border-border">
        <span className="text-xs text-foreground/80 px-1">Ukuran:</span>
        {sizes.map((s, i) => (
          <button
            key={s}
            onClick={() => setSize(s)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition ${
              size === s ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"
            }`}
            aria-label={`Ukuran ${["XS","S","M","L"][i]}`}
          >
            <span
              className="rounded-full inline-block"
              style={{
                width: Math.min(s, 14),
                height: Math.min(s, 14),
                backgroundColor: size === s ? "#1B4332" : "currentColor",
              }}
            />
            {["XS","S","M","L"][i]}
          </button>
        ))}
      </div>

      {/* Opacity slider with label */}
      <div className="flex items-center gap-3 bg-card rounded-xl px-3 py-2 border border-border">
        <Droplet className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs text-foreground/80 shrink-0">Opasitas</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(parseFloat(e.target.value))}
          className="flex-1 accent-primary"
          aria-label="Opasitas"
        />
        <span className="text-xs text-foreground/80 w-10 text-right tabular-nums">
          {Math.round(opacity * 100)}%
        </span>
      </div>

      {/* Touch sensitivity & smoothing settings */}
      {showSettings && (
        <div className="bg-card rounded-xl p-3 border border-border space-y-3">
          <p className="text-xs font-semibold text-primary">Pengaturan Sentuhan</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-foreground/80">
              <span>Sensitivitas Sentuh</span>
              <span className="tabular-nums">{Math.round((4 - sensitivity) / 3.8 * 100)}%</span>
            </div>
            <input
              type="range" min={0.2} max={4} step={0.1}
              value={sensitivity}
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              className="w-full accent-primary"
              aria-label="Sensitivitas sentuh"
            />
            <p className="text-[10px] text-muted-foreground">Tinggi = tangkap setiap gerakan kecil. Rendah = abaikan getaran jari.</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-foreground/80">
              <span>Penghalusan Garis</span>
              <span className="tabular-nums">{Math.round(smoothing * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.05}
              value={smoothing}
              onChange={(e) => setSmoothing(parseFloat(e.target.value))}
              className="w-full accent-primary"
              aria-label="Penghalusan garis"
            />
            <p className="text-[10px] text-muted-foreground">Tinggi = garis halus melengkung. Rendah = garis tajam apa adanya.</p>
          </div>
        </div>
      )}

      {/* Color palette with label */}
      <div className="bg-card rounded-xl p-2 border border-border space-y-2">
        <p className="text-xs text-foreground/80 px-1">
          Warna: <span className="font-semibold text-primary">{COLORS.find((c) => c.hex === color)?.name ?? "—"}</span>
        </p>
        <div className="grid grid-cols-6 gap-2">
          {COLORS.map((c) => (
            <button
              key={c.hex}
              onClick={() => { setColor(c.hex); setTool("pencil"); }}
              aria-label={`Warna ${c.name}`}
              title={c.name}
              className={`aspect-square rounded-lg border-2 transition flex items-end justify-center p-0.5 ${color === c.hex && tool === "pencil" ? "border-primary scale-110 shadow-md" : "border-border/40"}`}
              style={{ backgroundColor: c.hex }}
            >
              <span
                className="text-[8px] font-semibold leading-none px-1 rounded bg-black/55 text-white"
              >
                {c.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolBtn({
  active,
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; label: string }) {
  return (
    <button
      {...props}
      aria-label={label}
      className={`h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium transition ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
