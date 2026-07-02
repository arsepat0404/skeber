import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useConnectionStatus() {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [realtimeOk, setRealtimeOk] = useState<boolean>(true);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    const ch = supabase.channel("__heartbeat__");
    ch.subscribe((status) => {
      setRealtimeOk(status === "SUBSCRIBED" || status === "CHANNEL_ERROR" ? status === "SUBSCRIBED" : realtimeOk);
    });
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { online, realtimeOk, connected: online };
}
