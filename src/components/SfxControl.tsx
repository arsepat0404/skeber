import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getVolume, isMuted, setMuted, setVolume, subscribeSfx, sfx } from "@/lib/sfx";

export function SfxControl({ compact = false }: { compact?: boolean }) {
  const [muted, setMutedState] = useState(isMuted());
  const [vol, setVolState] = useState(getVolume());

  useEffect(() => {
    const unsub = subscribeSfx(() => {
      setMutedState(isMuted());
      setVolState(getVolume());
    });
    return () => { unsub; };
  }, []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    if (!next) sfx.click();
  }

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "bg-card border border-border rounded-xl px-3 py-2"}`}>
      <button
        onClick={toggle}
        aria-label={muted ? "Aktifkan suara" : "Matikan suara"}
        className="h-8 px-2 rounded-md flex items-center gap-1 text-xs font-medium border border-border bg-muted text-foreground hover:bg-muted/70"
      >
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        <span>{muted ? "Suara: Off" : "Suara: On"}</span>
      </button>
      {!compact && (
        <>
          <input
            type="range" min={0} max={1} step={0.05}
            value={vol}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            disabled={muted}
            aria-label="Volume efek suara"
            className="flex-1 accent-primary"
          />
          <span className="text-xs text-foreground/80 w-10 text-right tabular-nums">
            {Math.round(vol * 100)}%
          </span>
        </>
      )}
    </div>
  );
}
