import { useEffect, useMemo, useRef, useState } from "react";
import { Screen, BrandLogo, PrimaryButton } from "@/components/Screen";
import { supabase } from "@/integrations/supabase/client";
import { clearSession, getSession, leaveRoomCleanup, restartRoom } from "@/lib/game";
import {
  Sparkles, Home, ChevronLeft, ChevronRight, Play, Pause, RotateCcw,
  Download, FileDown, Loader2, Repeat,
} from "lucide-react";
import { downloadDataUrl, exportGalleryPdf, renderChainPng } from "@/lib/exportGallery";
import { toast } from "sonner";
import { sfx } from "@/lib/sfx";

interface PlayerRow { id: string; nickname: string; seat: number; }
interface StepRow {
  id: string; chain_owner_id: string; author_id: string;
  step_index: number; kind: string;
  text_content: string | null; drawing_data: string | null;
}

interface Props { onHome: () => void; onPlayAgain?: () => void; }

const SLIDE_MS = 2200;

export default function GalleryScreen({ onHome, onPlayAgain }: Props) {
  const session = getSession()!;
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [chainIdx, setChainIdx] = useState(0);
  const [stepCursor, setStepCursor] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef<number | null>(null);

  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null);

  async function exportCurrentChainPng() {
    if (!currentChain || chainSteps.length === 0) return;
    setExporting("png");
    try {
      const dataUrl = await renderChainPng(currentChain, chainSteps, players);
      downloadDataUrl(dataUrl, `SkeBer-${currentChain.nickname}.png`);
      toast.success("Gambar evolusi tersimpan!");
    } catch (e: any) {
      toast.error("Gagal menyimpan: " + (e.message ?? "error"));
    } finally {
      setExporting(null);
    }
  }

  async function exportAllPdf() {
    setExporting("pdf");
    try {
      await exportGalleryPdf(players, steps);
      toast.success("PDF galeri tersimpan!");
    } catch (e: any) {
      toast.error("Gagal membuat PDF: " + (e.message ?? "error"));
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: ps } = await supabase
        .from("players").select("id, nickname, seat").eq("room_id", session.roomId)
        .order("seat", { ascending: true });
      if (ps) setPlayers(ps);
      const { data: ss } = await supabase
        .from("steps").select("*").eq("room_id", session.roomId)
        .order("step_index", { ascending: true });
      if (ss) setSteps(ss as StepRow[]);
    })().then(() => sfx.finish());

    const ch = supabase
      .channel(`gallery-${session.roomId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${session.roomId}` },
        (payload: any) => {
          const r = payload.new;
          if (r?.status === "lobby") {
            toast.info("Host memulai room baru — kembali ke lobby!");
            onPlayAgain?.();
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session.roomId, onPlayAgain]);

  const totalChains = players.length;
  const currentChain = players[chainIdx];
  const chainSteps = useMemo(() => {
    return currentChain
      ? steps.filter((s) => s.chain_owner_id === currentChain.id).sort((a, b) => a.step_index - b.step_index)
      : [];
  }, [steps, currentChain]);

  // Reset cursor when chain changes
  useEffect(() => { setStepCursor(0); }, [chainIdx]);

  // Auto-advance playback
  useEffect(() => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    if (!playing || chainSteps.length === 0) return;
    if (stepCursor >= chainSteps.length - 1) {
      // chain finished; auto-go to next chain after pause
      timerRef.current = window.setTimeout(() => {
        if (chainIdx < totalChains - 1) {
          setChainIdx((i) => i + 1);
        } else {
          setPlaying(false);
        }
      }, SLIDE_MS + 600);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      setStepCursor((c) => c + 1);
    }, SLIDE_MS);
    return () => {
      if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [playing, stepCursor, chainSteps.length, chainIdx, totalChains]);

  async function exit() {
    try { await leaveRoomCleanup(supabase, session.roomId, session.playerId); } catch {}
    clearSession();
    onHome();
  }

  const [restarting, setRestarting] = useState(false);
  async function playAgain() {
    setRestarting(true);
    try {
      // Host (or anyone — first to click) resets the room
      await restartRoom(supabase, session.roomId);
      sfx.click();
      toast.success("Room dimulai ulang! Menunggu di lobby...");
      onPlayAgain?.();
    } catch (e: any) {
      toast.error("Gagal memulai ulang: " + (e.message ?? "error"));
    } finally {
      setRestarting(false);
    }
  }

  function authorName(id: string) {
    return players.find((p) => p.id === id)?.nickname ?? "?";
  }

  const visibleSteps = chainSteps.slice(0, stepCursor + 1);
  const progressPct = chainSteps.length
    ? ((stepCursor + 1) / chainSteps.length) * 100
    : 0;

  return (
    <Screen>
      <div className="flex-1 flex flex-col max-w-md w-full mx-auto gap-4 animate-float-in">
        <div className="text-center pt-2 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> Permainan Selesai!
          </div>
          <BrandLogo size="md" />
          <h2 className="font-display text-xl">Galeri Evolusi</h2>
          <p className="text-sm text-foreground/80 px-6">
            Lihat bagaimana ide kreatif berubah dari satu pemain ke pemain berikutnya.
          </p>
        </div>

        {/* Chain navigator */}
        {totalChains > 0 && (
          <div className="flex items-center justify-between bg-card border border-border rounded-xl px-2 py-2 gap-2">
            <button
              onClick={() => { setChainIdx((i) => (i - 1 + totalChains) % totalChains); sfx.click(); }}
              className="h-9 px-3 rounded-lg bg-muted hover:bg-muted/70 flex items-center gap-1 text-xs font-medium"
              aria-label="Cerita Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" /> Sebelumnya
            </button>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-foreground/70">Cerita milik</p>
              <p className="font-semibold text-primary">{currentChain?.nickname}</p>
              <p className="text-[10px] text-foreground/70">{chainIdx + 1} / {totalChains}</p>
            </div>
            <button
              onClick={() => { setChainIdx((i) => (i + 1) % totalChains); sfx.click(); }}
              className="h-9 px-3 rounded-lg bg-muted hover:bg-muted/70 flex items-center gap-1 text-xs font-medium"
              aria-label="Cerita Berikutnya"
            >
              Berikutnya <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Playback controls */}
        <div className="bg-card border border-border rounded-xl px-3 py-2 space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setPlaying((p) => !p); sfx.click(); }}
              className="h-10 px-3 rounded-full bg-primary text-primary-foreground flex items-center gap-1.5 text-xs font-semibold hover:opacity-90"
              aria-label={playing ? "Jeda pemutaran" : "Putar pemutaran"}
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {playing ? "Jeda" : "Putar"}
            </button>
            <button
              onClick={() => { setStepCursor(0); setPlaying(true); sfx.click(); }}
              className="h-10 px-3 rounded-full bg-muted text-foreground flex items-center gap-1.5 text-xs font-semibold hover:bg-muted/70"
              aria-label="Ulangi pemutaran"
            >
              <RotateCcw className="w-4 h-4" /> Ulangi
            </button>
            <div className="flex-1">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-[10px] text-foreground/70 mt-1">
                {Math.min(stepCursor + 1, chainSteps.length)} / {chainSteps.length} langkah
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 pb-4">
          {visibleSteps.map((s, i) => (
            <div
              key={s.id}
              className="bg-card border border-border rounded-2xl p-4 animate-float-in"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-wider text-primary font-semibold">
                  {s.kind === "sentence" ? "Kalimat awal" : s.kind === "drawing" ? "Gambar" : "Tebakan"}
                </span>
                <span className="text-xs text-foreground/70">
                  oleh {authorName(s.author_id)} · #{i + 1}
                </span>
              </div>
              {s.text_content && (
                <p className="text-base font-medium leading-snug">"{s.text_content}"</p>
              )}
              {s.drawing_data && (
                <img src={s.drawing_data} alt="gambar" className="w-full rounded-xl bg-white mt-1" />
              )}
            </div>
          ))}
        </div>

        {/* Share / export */}
        <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
          <p className="text-xs font-semibold text-primary">Bagikan Galeri</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={exportCurrentChainPng}
              disabled={exporting !== null}
              className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {exporting === "png" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              PNG (cerita ini)
            </button>
            <button
              onClick={exportAllPdf}
              disabled={exporting !== null}
              className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {exporting === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              PDF (semua cerita)
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Gambar dilengkapi nama pemain dan urutan langkah.
          </p>
        </div>

        <PrimaryButton onClick={playAgain} disabled={restarting}>
          <Repeat className="w-4 h-4 mr-2" /> {restarting ? "Memulai ulang..." : "Main Lagi (Room Sama)"}
        </PrimaryButton>

        <button
          onClick={exit}
          className="h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-base border-2 border-primary/60 text-primary bg-transparent hover:bg-primary/10 transition-colors"
        >
          <Home className="w-4 h-4" /> Selesai & Kembali ke Beranda
        </button>
      </div>
    </Screen>
  );
}
