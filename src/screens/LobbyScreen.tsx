import { useEffect, useState } from "react";
import { Screen, BrandLogo, PrimaryButton } from "@/components/Screen";
import { supabase } from "@/integrations/supabase/client";
import { clearSession, getSession, leaveRoomCleanup } from "@/lib/game";
import { Copy, Crown, LogOut, Users, Share2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onStart: () => void;
  onLeave: () => void;
}

interface PlayerRow {
  id: string;
  nickname: string;
  seat: number;
}

export default function LobbyScreen({ onStart, onLeave }: Props) {
  const session = getSession()!;
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("lobby");
  const [busy, setBusy] = useState(false);

  const isHost = hostId === session.playerId;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: room } = await supabase.from("rooms").select("*").eq("id", session.roomId).maybeSingle();
      if (room && !cancelled) {
        setHostId(room.host_id);
        setStatus(room.status);
        if (room.status === "playing") onStart();
      }
      const { data: ps } = await supabase
        .from("players")
        .select("id, nickname, seat")
        .eq("room_id", session.roomId)
        .order("seat", { ascending: true });
      if (ps && !cancelled) setPlayers(ps);
    }
    load();

    const channel = supabase
      .channel(`lobby-${session.roomId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${session.roomId}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${session.roomId}` },
        (payload: any) => {
          const r = payload.new;
          if (!r) return;
          setHostId(r.host_id);
          setStatus(r.status);
          if (r.status === "playing") onStart();
          if (r.status === "finished") {
            toast.info("Room ditutup — kembali ke beranda.");
            clearSession();
            onLeave();
          }
        })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [session.roomId, session.playerId, onStart]);

  async function startGame() {
    if (players.length < 2) {
      toast.error("Butuh minimal 2 pemain.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("rooms")
        .update({ status: "playing", current_step: 0, num_players: players.length })
        .eq("id", session.roomId);
      if (error) throw error;
      // also handled by realtime, but call directly for host
      onStart();
    } catch (e: any) {
      toast.error("Gagal memulai: " + (e.message ?? "error"));
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    await leaveRoomCleanup(supabase, session.roomId, session.playerId);
    clearSession();
    onLeave();
  }

  function copyCode() {
    navigator.clipboard.writeText(session.roomCode);
    toast.success("Kode disalin!");
  }

  function shareLink() {
    const url = `${window.location.origin}?room=${session.roomCode}`;
    if (navigator.share) {
      navigator.share({
        title: "Sketsa Berantai — Yuk main bareng!",
        text: `Gabung di ruang ${session.roomCode}, kita main Sketsa Berantai bareng!`,
        url,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Link ruang disalin!");
    }
  }

  return (
    <Screen>
      <div className="flex-1 flex flex-col max-w-md w-full mx-auto gap-5 animate-float-in">
        <div className="flex items-center justify-between">
          <BrandLogo size="sm" />
          <button
            onClick={leave}
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
            aria-label="Keluar"
          >
            <LogOut className="w-4 h-4" /> Keluar
          </button>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 text-center space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Kode Ruang</p>
          <div className="font-mono text-4xl font-bold text-primary tracking-widest text-center">
            {session.roomCode}
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={copyCode}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition"
              aria-label="Salin Kode Ruang"
            >
              <Copy className="w-4 h-4" /> Salin Kode
            </button>
            <button
              onClick={shareLink}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition"
              aria-label="Bagikan link ruang"
            >
              <Share2 className="w-4 h-4" /> Share Link
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Bagikan kode atau link langsung ke teman</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="w-4 h-4 text-primary" />
            Pemain ({players.length})
          </div>
          <ul className="space-y-2">
            {players.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2"
              >
                <span className="font-medium flex items-center gap-2">
                  {p.nickname}
                  {p.id === session.playerId && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary">kamu</span>
                  )}
                </span>
                {p.id === hostId && <Crown className="w-4 h-4 text-primary" />}
              </li>
            ))}
          </ul>
        </div>


        {isHost ? (
          <PrimaryButton onClick={startGame} disabled={busy || players.length < 2}>
            {busy ? "Memulai..." : `Mulai Permainan (${players.length} pemain)`}
          </PrimaryButton>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-4">
            Menunggu host memulai permainan...
          </div>
        )}

        <div className="text-xs text-muted-foreground text-center px-4 leading-relaxed">
          Status: {status === "lobby" ? "Menunggu pemain" : status}
        </div>
      </div>
    </Screen>
  );
}
