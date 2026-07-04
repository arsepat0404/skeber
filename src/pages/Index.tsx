import { useEffect, useState } from "react";
import GateScreen from "@/screens/GateScreen";
import HomeScreen from "@/screens/HomeScreen";
import LobbyScreen from "@/screens/LobbyScreen";
import GameScreen from "@/screens/GameScreen";
import GalleryScreen from "@/screens/GalleryScreen";
import { getSession, isUnlocked } from "@/lib/game";
import { supabase } from "@/integrations/supabase/client";

type Stage = "gate" | "home" | "lobby" | "game" | "gallery";

// Baca room code dari URL ?room=XXXXX
function getRoomFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("room") ?? "";
}

// Simpan room code dari URL agar tidak hilang saat redirect
const PENDING_ROOM_KEY = "skeber_pending_room";
function savePendingRoom(code: string) {
  if (code) sessionStorage.setItem(PENDING_ROOM_KEY, code);
}
function getPendingRoom(): string {
  return sessionStorage.getItem(PENDING_ROOM_KEY) ?? "";
}
function clearPendingRoom() {
  sessionStorage.removeItem(PENDING_ROOM_KEY);
}

const Index = () => {
  const [stage, setStage] = useState<Stage>("gate");
  const [pendingRoom, setPendingRoom] = useState<string>("");

  useEffect(() => {
    // Simpan room code dari URL saat pertama load
    const roomFromUrl = getRoomFromUrl();
    if (roomFromUrl) savePendingRoom(roomFromUrl);

    (async () => {
      if (!isUnlocked()) {
        setStage("gate"); return;
      }
      const session = getSession();
      if (!session) {
        // Cek ada pending room dari link
        const pending = getPendingRoom() || roomFromUrl;
        if (pending) setPendingRoom(pending);
        setStage("home"); return;
      }
      // resume based on room status
      const { data: room } = await supabase.from("rooms").select("status").eq("id", session.roomId).maybeSingle();
      if (!room) { setStage("home"); return; }
      if (room.status === "lobby") setStage("lobby");
      else if (room.status === "playing") setStage("game");
      else setStage("gallery");
    })();
  }, []);

  function handleUnlocked() {
    const pending = getPendingRoom() || getRoomFromUrl();
    if (pending) setPendingRoom(pending);
    setStage("home");
  }

  function handleJoined() {
    clearPendingRoom();
    setPendingRoom("");
    setStage("lobby");
  }

  if (stage === "gate") return <GateScreen onUnlocked={handleUnlocked} />;
  if (stage === "home") return <HomeScreen onJoined={handleJoined} prefillRoomCode={pendingRoom} />;
  if (stage === "lobby") return <LobbyScreen onStart={() => setStage("game")} onLeave={() => setStage("home")} />;
  if (stage === "game") return <GameScreen onFinished={() => setStage("gallery")} onLeave={() => setStage("home")} />;
  return <GalleryScreen onHome={() => setStage("home")} onPlayAgain={() => setStage("lobby")} />;
};

export default Index;
