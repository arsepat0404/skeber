import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Screen, BrandLogo, PrimaryButton } from "@/components/Screen";
import { supabase } from "@/integrations/supabase/client";
import { authorSeatForStep, clearSession, getSession, leaveRoomCleanup, stepKind } from "@/lib/game";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { Input } from "@/components/ui/input";
import { Loader2, PenLine, Brush, HelpCircle, LogOut, Timer } from "lucide-react";
import { toast } from "sonner";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { sfx } from "@/lib/sfx";
import { SfxControl } from "@/components/SfxControl";

interface PlayerRow { id: string; nickname: string; seat: number; }
interface StepRow {
  id: string;
  chain_owner_id: string;
  author_id: string;
  step_index: number;
  kind: string;
  text_content: string | null;
  drawing_data: string | null;
}

interface Props {
  onFinished: () => void;
  onLeave: () => void;
}

export default function GameScreen({ onFinished, onLeave }: Props) {
  const session = getSession()!;
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [text, setText] = useState("");
  const [drawing, setDrawing] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const prevStepRef = useRef<number | null>(null);
  const textRef = useRef("");
  const drawingRef = useRef("");
  const autoSubmittedRef = useRef(false);
  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => { drawingRef.current = drawing; }, [drawing]);

  const numPlayers = players.length;
  const isHost = hostId === session.playerId;
  const mySeat = players.find((p) => p.id === session.playerId)?.seat ?? 0;
  const kind = stepKind(currentStep);

  // Find which chain this player is assigned to at the current step.
  // We want: authorSeatForStep(ownerSeat, step) == mySeat  =>  ownerSeat = (mySeat - step) mod n
  const myChainOwnerSeat = useMemo(() => {
    if (numPlayers === 0) return 0;
    return ((mySeat - currentStep) % numPlayers + numPlayers) % numPlayers;
  }, [mySeat, currentStep, numPlayers]);

  const myChainOwner = players.find((p) => p.seat === myChainOwnerSeat);

  // The previous step in this chain (what we should look at)
  const prevStep = steps.find(
    (s) => s.chain_owner_id === myChainOwner?.id && s.step_index === currentStep - 1
  );

  // My already-submitted step (if any)
  const mySubmittedStep = steps.find(
    (s) => s.chain_owner_id === myChainOwner?.id && s.step_index === currentStep && s.author_id === session.playerId
  );

  const submittedCount = steps.filter((s) => s.step_index === currentStep).length;
  const allSubmitted = numPlayers > 0 && submittedCount >= numPlayers;

  const load = useCallback(async () => {
    const { data: room } = await supabase.from("rooms").select("*").eq("id", session.roomId).maybeSingle();
    if (room) {
      setHostId(room.host_id);
      setCurrentStep(room.current_step);
      if (room.status === "finished") onFinished();
      // Defensive: if room was reset to lobby (Main Lagi), reload so Index routes to lobby
      if (room.status === "lobby") {
        toast.info("Room di-reset — kembali ke lobby!");
        window.location.reload();
      }
    }
    const { data: ps } = await supabase
      .from("players").select("id, nickname, seat").eq("room_id", session.roomId)
      .order("seat", { ascending: true });
    if (ps) setPlayers(ps);
    const { data: ss } = await supabase
      .from("steps").select("*").eq("room_id", session.roomId);
    if (ss) setSteps(ss as StepRow[]);
  }, [session.roomId, onFinished, onLeave]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`game-${session.roomId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "steps", filter: `room_id=eq.${session.roomId}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${session.roomId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.roomId, load]);

  // Host auto-advances when everyone submitted
  useEffect(() => {
    async function maybeAdvance() {
      if (!isHost || !allSubmitted) return;
      const next = currentStep + 1;
      if (next >= numPlayers) {
        await supabase.from("rooms").update({ status: "finished" }).eq("id", session.roomId);
        onFinished();
      } else {
        await supabase.from("rooms").update({ current_step: next }).eq("id", session.roomId);
      }
    }
    maybeAdvance();
  }, [isHost, allSubmitted, currentStep, numPlayers, session.roomId, onFinished]);

  // Reset inputs + show toast + play SFX when step changes
  useEffect(() => {
    setText("");
    setDrawing("");
    autoSubmittedRef.current = false;
    if (prevStepRef.current !== null && prevStepRef.current !== currentStep) {
      const k = stepKind(currentStep);
      const labels: Record<string, string> = {
        sentence: "✍️ Giliranmu menulis kalimat!",
        drawing: "🎨 Giliranmu menggambar!",
        guess: "🔍 Giliranmu menebak gambar!",
      };
      toast(labels[k] ?? "Tahap baru dimulai!");
      if (k === "sentence") sfx.phaseWrite();
      else if (k === "drawing") sfx.phaseDraw();
      else sfx.phaseGuess();
    }
    prevStepRef.current = currentStep;
  }, [currentStep]);

  // ====== Countdown timer per phase (Gartic Phone-inspired durations) ======
  // sentence/guess = 60s, drawing = 120s
  const phaseDuration = kind === "drawing" ? 120 : 60;
  const [timeLeft, setTimeLeft] = useState(phaseDuration);
  const lastAlertRef = useRef<number>(-1);

  // Reset timer at every step change
  useEffect(() => {
    setTimeLeft(phaseDuration);
    lastAlertRef.current = -1;
  }, [currentStep, phaseDuration]);

  useEffect(() => {
    if (mySubmittedStep) return; // already done — no need to tick
    if (numPlayers === 0) return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [mySubmittedStep, numPlayers, currentStep]);

  // ====== Dynamic countdown (Gartic-style): when most are done, speed up ======
  // For drawing/guess phases, if ≥75% of players submitted, cap remaining time to 15s.
  const fastForwardCap = kind === "drawing" ? 15 : kind === "guess" ? 10 : null;
  useEffect(() => {
    if (mySubmittedStep) return;
    if (fastForwardCap == null) return;
    if (numPlayers < 2) return;
    const ratio = submittedCount / numPlayers;
    if (ratio >= 0.75 && timeLeft > fastForwardCap) {
      setTimeLeft(fastForwardCap);
      toast.info(`⚡ Mayoritas selesai — sisa ${fastForwardCap} detik!`);
    }
  }, [submittedCount, numPlayers, fastForwardCap, mySubmittedStep, timeLeft]);

  // SFX as time runs low — Gartic-like adrenaline ramp
  useEffect(() => {
    if (mySubmittedStep) return;
    if (timeLeft <= 0) return;
    if (timeLeft <= 10 && timeLeft !== lastAlertRef.current) {
      lastAlertRef.current = timeLeft;
      if (timeLeft <= 3) sfx.alert();
      else if (timeLeft <= 5) sfx.tickFast();
      else sfx.tick();
    }
  }, [timeLeft, mySubmittedStep]);

  // Auto-submit when timer hits zero
  useEffect(() => {
    if (timeLeft > 0) return;
    if (mySubmittedStep) return;
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    sfx.timeout();
    (async () => {
      const k = stepKind(currentStep);
      try {
        if (k === "drawing") {
          // Submit current drawing or a blank canvas if none
          let dataUrl = drawingRef.current;
          if (!dataUrl) {
            const c = document.createElement("canvas");
            c.width = 400; c.height = 400;
            const cx = c.getContext("2d")!;
            cx.fillStyle = "#FFFFFF"; cx.fillRect(0, 0, 400, 400);
            cx.fillStyle = "#888"; cx.font = "20px sans-serif";
            cx.fillText("(waktu habis)", 120, 200);
            dataUrl = c.toDataURL("image/png");
          }
          await submit({ kind: "drawing", drawing_data: dataUrl });
        } else {
          const t = textRef.current.trim() || "(waktu habis)";
          await submit({ kind: k, text_content: t.slice(0, 140) });
        }
        toast.warning("⏰ Waktu habis! Jawabanmu dikirim otomatis.");
      } catch {
        // ignored — submit handles errors
      }
    })();
  }, [timeLeft, mySubmittedStep, currentStep]);

  async function leaveRoom() {
    if (!confirm("Yakin keluar dari ruang? Permainan akan tetap berjalan untuk pemain lain.")) return;
    try {
      await leaveRoomCleanup(supabase, session.roomId, session.playerId);
    } catch (e) {
      // ignore
    }
    clearSession();
    onLeave();
  }

  async function submitSentence() {
    const t = text.trim();
    if (t.length < 3 || t.length > 140) {
      toast.error("Kalimat harus 3-140 karakter.");
      return;
    }
    await submit({ kind: "sentence", text_content: t });
  }
  async function submitGuess() {
    const t = text.trim();
    if (t.length < 2 || t.length > 140) {
      toast.error("Tebakan harus 2-140 karakter.");
      return;
    }
    await submit({ kind: "guess", text_content: t });
  }
  async function submitDrawing() {
    if (!drawing) {
      toast.error("Gambar dulu ya!");
      return;
    }
    await submit({ kind: "drawing", drawing_data: drawing });
  }

  async function submit(payload: { kind: string; text_content?: string; drawing_data?: string }) {
    if (!myChainOwner) return;
    if (mySubmittedStep) {
      toast.info("Kamu sudah mengirim untuk tahap ini.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("steps").insert({
        room_id: session.roomId,
        chain_owner_id: myChainOwner.id,
        author_id: session.playerId,
        step_index: currentStep,
        ...payload,
      });
      if (error) {
        // 23505 = unique_violation (double submit race)
        if ((error as any).code === "23505") {
          toast.info("Sudah terkirim sebelumnya.");
          await load();
          return;
        }
        throw error;
      }
      if (payload.kind === "sentence") sfx.submitWrite();
      else if (payload.kind === "drawing") sfx.submitDraw();
      else if (payload.kind === "guess") sfx.submitGuess();
      else sfx.submit();
      toast.success("Terkirim! Menunggu pemain lain...");
    } catch (e: any) {
      toast.error("Gagal mengirim: " + (e.message ?? "error"));
    } finally {
      setSubmitting(false);
    }
  }


  if (numPlayers === 0) {
    return (
      <Screen>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Screen>
    );
  }

  const phaseLabels: Record<string, { label: string; icon: any; desc: string }> = {
    sentence: { label: "Tahap 1 — Menulis", icon: PenLine, desc: "Tulis sebuah kalimat rahasia. Pemain lain akan menggambarnya!" },
    drawing:  { label: `Tahap ${currentStep + 1} — Menggambar`, icon: Brush, desc: "Gambar kalimat di bawah ini. Jangan tulis huruf!" },
    guess:    { label: `Tahap ${currentStep + 1} — Menebak`, icon: HelpCircle, desc: "Tebak gambar yang kamu lihat ini!" },
  };
  const phase = phaseLabels[kind];
  const Icon = phase.icon;

  return (
    <Screen>
      <div className="flex-1 flex flex-col max-w-md w-full mx-auto gap-4 animate-float-in">
        <div className="flex items-center justify-between gap-2">
          <BrandLogo size="sm" />
          <div className="flex items-center gap-2">
            <div className="text-xs text-foreground/80">
              Langkah {currentStep + 1} / {numPlayers}
            </div>
            <button
              onClick={leaveRoom}
              className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1 px-2 py-1 rounded-md border border-destructive/40"
              aria-label="Keluar Room"
            >
              <LogOut className="w-3.5 h-3.5" /> Keluar Room
            </button>
          </div>
        </div>

        <SfxControl />
        <ConnectionBanner />

        {/* Persistent phase banner — always visible, real-time */}
        <div className="sticky top-2 z-10 bg-primary text-primary-foreground rounded-2xl p-3 flex items-center gap-3 shadow-lg border-2 border-primary-foreground/10">
          <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">
              Giliranmu sekarang
            </p>
            <p className="font-display text-base leading-tight truncate">
              {kind === "sentence" ? "✍️ Tulis Kalimat" : kind === "drawing" ? "🎨 Gambar Sekarang" : "🔍 Tebak Gambarnya"}
            </p>
          </div>
          <div className={`flex flex-col items-end gap-0.5 px-2 py-1 rounded-lg ${timeLeft <= 10 && !mySubmittedStep ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-primary-foreground/15"}`}>
            <div className="flex items-center gap-1 text-[10px] uppercase font-semibold">
              <Timer className="w-3 h-3" /> Waktu
            </div>
            <div className="font-bold text-lg leading-none tabular-nums">
              {mySubmittedStep ? "✓" : `${timeLeft}s`}
            </div>
          </div>
        </div>

        {/* Countdown bar */}
        {!mySubmittedStep && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden -mt-2">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${timeLeft <= 10 ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${(timeLeft / phaseDuration) * 100}%` }}
            />
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg leading-tight">{phase.label}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{phase.desc}</p>
          </div>
        </div>

        {/* Show what we received from previous step */}
        {prevStep && (
          <div className="bg-surface border border-primary/30 rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-wider text-primary mb-2 font-semibold">
              {prevStep.kind === "sentence" ? "Kalimat untuk digambar" : prevStep.kind === "drawing" ? "Gambar untuk ditebak" : "Tebakan untuk digambar"}
            </p>
            {prevStep.text_content && (
              <p className="text-lg font-semibold leading-snug">"{prevStep.text_content}"</p>
            )}
            {prevStep.drawing_data && (
              <img
                src={prevStep.drawing_data}
                alt="gambar sebelumnya"
                className="w-full rounded-xl bg-white"
              />
            )}
          </div>
        )}

        {/* Input area */}
        {mySubmittedStep ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
            <p className="font-medium">Sudah terkirim!</p>
            <p className="text-sm text-muted-foreground">
              {submittedCount} / {numPlayers} pemain selesai. Menunggu yang lain...
            </p>
          </div>
        ) : kind === "sentence" ? (
          <div className="space-y-3">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Tulis kalimat lucu, aneh, atau ajaib..."
              maxLength={140}
              className="h-14 text-base bg-input border-border"
            />
            <p className="text-xs text-muted-foreground text-right">{text.length}/140</p>
            <PrimaryButton onClick={submitSentence} disabled={submitting}>
              {submitting ? "Mengirim..." : "Kirim Kalimat"}
            </PrimaryButton>
          </div>
        ) : kind === "drawing" ? (
          <div className="space-y-3">
            <DrawingCanvas onChange={setDrawing} />
            <PrimaryButton onClick={submitDrawing} disabled={submitting || !drawing}>
              {submitting ? "Mengirim..." : "Kirim Gambar"}
            </PrimaryButton>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Menurutmu ini gambar apa?"
              maxLength={140}
              className="h-14 text-base bg-input border-border"
            />
            <p className="text-xs text-muted-foreground text-right">{text.length}/140</p>
            <PrimaryButton onClick={submitGuess} disabled={submitting}>
              {submitting ? "Mengirim..." : "Kirim Tebakan"}
            </PrimaryButton>
          </div>
        )}

        {/* Real-time progress: who's done, who we wait for */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-primary">
              Progres tahap {currentStep + 1}
            </span>
            <span className="text-muted-foreground">
              {submittedCount} / {numPlayers} selesai
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${numPlayers ? (submittedCount / numPlayers) * 100 : 0}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {players.map((p) => {
              const done = steps.some(
                (s) => s.step_index === currentStep && s.author_id === p.id
              );
              return (
                <span
                  key={p.id}
                  className={`text-[11px] px-2 py-0.5 rounded-full border ${
                    done
                      ? "bg-primary/20 text-primary border-primary/40"
                      : "bg-muted/40 text-muted-foreground border-border"
                  }`}
                >
                  {done ? "✓ " : "⏳ "}
                  {p.nickname}
                  {p.id === session.playerId && " (kamu)"}
                </span>
              );
            })}
          </div>
          {allSubmitted && (
            <p className="text-xs text-center text-primary animate-pulse">
              Semua pemain selesai! Lanjut ke tahap berikutnya...
            </p>
          )}
        </div>

      </div>
    </Screen>
  );
}
