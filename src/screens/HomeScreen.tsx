import { useState } from "react";
import { Screen, BrandLogo, PrimaryButton, SecondaryButton } from "@/components/Screen";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { generateRoomCode, setSession } from "@/lib/game";
import { toast } from "sonner";
import { Plus, LogIn, Sparkles, ArrowRight } from "lucide-react";

import { SfxControl } from "@/components/SfxControl";

interface Props {
  onJoined: () => void;
}

export default function HomeScreen({ onJoined }: Props) {
  const [nickname, setNickname] = useState("");

  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");

  function validateNick() {
    const n = nickname.trim();
    if (n.length < 2 || n.length > 16) {
      toast.error("Nama panggilan harus 2-16 karakter.");
      return null;
    }
    return n;
  }

  async function createRoom() {
    const nick = validateNick();
    if (!nick) return;
    setBusy(true);
    try {
      const code = generateRoomCode();
      const { data: room, error } = await supabase
        .from("rooms")
        .insert({ code, status: "lobby" })
        .select()
        .single();
      if (error) throw error;

      const { data: player, error: pErr } = await supabase
        .from("players")
        .insert({ room_id: room.id, nickname: nick, seat: 0 })
        .select()
        .single();
      if (pErr) throw pErr;

      await supabase.from("rooms").update({ host_id: player.id, num_players: 1 }).eq("id", room.id);

      setSession({ playerId: player.id, nickname: nick, roomId: room.id, roomCode: code });
      toast.success(`Ruang dibuat! Kode: ${code}`);
      onJoined();
    } catch (e: any) {
      toast.error("Gagal membuat ruang: " + (e.message ?? "error"));
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    const nick = validateNick();
    if (!nick) return;
    const code = roomCode.trim().toUpperCase();
    if (code.length < 4) {
      toast.error("Masukkan kode ruang yang valid.");
      return;
    }
    setBusy(true);
    try {
      const { data: room, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      if (!room) {
        toast.error("Ruang tidak ditemukan.");
        return;
      }
      if (room.status !== "lobby") {
        toast.error("Permainan sudah dimulai di ruang ini.");
        return;
      }

      const { count } = await supabase
        .from("players")
        .select("*", { count: "exact", head: true })
        .eq("room_id", room.id);
      const seat = count ?? 0;

      const { data: player, error: pErr } = await supabase
        .from("players")
        .insert({ room_id: room.id, nickname: nick, seat })
        .select()
        .single();
      if (pErr) throw pErr;

      await supabase.from("rooms").update({ num_players: seat + 1 }).eq("id", room.id);

      setSession({ playerId: player.id, nickname: nick, roomId: room.id, roomCode: code });
      toast.success(`Bergabung ke ruang ${code}!`);
      onJoined();
    } catch (e: any) {
      toast.error("Gagal bergabung: " + (e.message ?? "error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <div className="flex-1 flex flex-col max-w-md w-full mx-auto gap-6 pt-4 animate-float-in">
        <BrandLogo />

        <div className="bg-card border border-border rounded-2xl p-5 space-y-4 mt-2">
          <label className="block text-sm font-medium">Nama Panggilan</label>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Contoh: Budi Kreatif"
            maxLength={16}
            className="h-12 bg-input border-border"
          />

          {mode === "choose" && (
            <div className="grid grid-cols-1 gap-3 pt-2">
              <PrimaryButton onClick={() => setMode("create")} disabled={!nickname.trim()}>
                <Plus className="w-5 h-5 mr-2" /> Buat Ruang Baru
              </PrimaryButton>
              <SecondaryButton onClick={() => setMode("join")} disabled={!nickname.trim()}>
                <LogIn className="w-5 h-5 mr-2" /> Gabung Ruang
              </SecondaryButton>
            </div>
          )}

          {mode === "create" && (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Kamu akan menjadi host. Bagikan kode ruang ke teman-teman.
              </p>
              <PrimaryButton onClick={createRoom} disabled={busy}>
                {busy ? "Membuat..." : "Buat Sekarang"}
              </PrimaryButton>
              <button
                className="w-full text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setMode("choose")}
              >
                ← kembali
              </button>
            </div>
          )}

          {mode === "join" && (
            <div className="space-y-3 pt-2">
              <Input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="KODE RUANG"
                maxLength={8}
                className="h-12 text-center tracking-widest font-mono text-lg bg-input border-border"
              />
              <PrimaryButton onClick={joinRoom} disabled={busy}>
                {busy ? "Bergabung..." : "Gabung Ruang"}
              </PrimaryButton>
              <button
                className="w-full text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setMode("choose")}
              >
                ← kembali
              </button>
            </div>
          )}
        </div>

        <SfxControl />

        <a
          href="https://arsepat-game.web.id/"
          className="group relative block w-full text-left bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/40 transition"
          aria-label="Buka Arsepat Game Hub"
        >
          <div className="relative h-28 sm:h-32">
            <img
              src="/assets/arsepat-hub-preview.jpg"
              alt="Preview Arsepat Game Hub"
              className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
            <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-foreground">Arsepat Game Hub</span>
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                Buka di sini <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
          <div className="p-3 space-y-1">
            <p className="text-sm font-semibold text-foreground leading-snug">
              Bosan nunggu? Coba game seru lainnya!
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Dari tebak-tebakan, kuis, hingga party game — semua bikin ketawa bareng teman.
            </p>
          </div>
        </a>

        <div className="text-center text-xs text-muted-foreground px-4">
          Minimal 3 pemain untuk pengalaman terbaik 🎨
        </div>
      </div>
    </Screen>
  );
}
