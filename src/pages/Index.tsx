import { useEffect, useState } from "react";
import GateScreen from "@/screens/GateScreen";
import HomeScreen from "@/screens/HomeScreen";
import LobbyScreen from "@/screens/LobbyScreen";
import GameScreen from "@/screens/GameScreen";
import GalleryScreen from "@/screens/GalleryScreen";
import { getSession, isUnlocked } from "@/lib/game";
import { supabase } from "@/integrations/supabase/client";

type Stage = "gate" | "home" | "lobby" | "game" | "gallery";

const Index = () => {
  const [stage, setStage] = useState<Stage>("gate");

  useEffect(() => {
    (async () => {
      if (!isUnlocked()) { setStage("gate"); return; }
      const session = getSession();
      if (!session) { setStage("home"); return; }
      // resume based on room status
      const { data: room } = await supabase.from("rooms").select("status").eq("id", session.roomId).maybeSingle();
      if (!room) { setStage("home"); return; }
      if (room.status === "lobby") setStage("lobby");
      else if (room.status === "playing") setStage("game");
      else setStage("gallery");
    })();
  }, []);

  if (stage === "gate") return <GateScreen onUnlocked={() => setStage("home")} />;
  if (stage === "home") return <HomeScreen onJoined={() => setStage("lobby")} />;
  if (stage === "lobby") return <LobbyScreen onStart={() => setStage("game")} onLeave={() => setStage("home")} />;
  if (stage === "game") return <GameScreen onFinished={() => setStage("gallery")} onLeave={() => setStage("home")} />;
  return <GalleryScreen onHome={() => setStage("home")} onPlayAgain={() => setStage("lobby")} />;
};

export default Index;
