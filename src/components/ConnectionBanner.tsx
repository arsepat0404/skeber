import { WifiOff, RefreshCw } from "lucide-react";
import { useConnectionStatus } from "@/hooks/use-connection";

interface Props {
  onReconnect?: () => void;
}

export function ConnectionBanner({ onReconnect }: Props) {
  const { online } = useConnectionStatus();
  if (online) return null;
  return (
    <div className="bg-destructive/15 border border-destructive/40 text-destructive rounded-xl p-3 flex items-center gap-3">
      <WifiOff className="w-5 h-5 shrink-0" />
      <div className="flex-1 text-xs">
        <p className="font-semibold">Koneksi terputus</p>
        <p className="text-destructive/80">Periksa internetmu. Permainan akan dilanjutkan otomatis saat tersambung.</p>
      </div>
      <button
        onClick={() => (onReconnect ? onReconnect() : window.location.reload())}
        className="flex items-center gap-1 text-xs font-semibold bg-destructive text-destructive-foreground px-3 py-1.5 rounded-lg hover:opacity-90"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Sambung Ulang
      </button>
    </div>
  );
}
