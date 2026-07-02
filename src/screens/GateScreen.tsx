import { useState } from "react";
import { Screen, BrandLogo, PrimaryButton } from "@/components/Screen";
import { Input } from "@/components/ui/input";
import { PASSCODE, unlock } from "@/lib/game";
import { Lock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onUnlocked: () => void;
}

export default function GateScreen({ onUnlocked }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      if (code.trim().toLowerCase() === PASSCODE) {
        unlock();
        toast.success("Akses diterima! Selamat bermain 🎨");
        onUnlocked();
      } else {
        toast.error("Kode salah. Coba lagi ya!");
        setLoading(false);
      }
    }, 400);
  }

  return (
    <Screen className="justify-center">
      <div className="flex-1 flex flex-col items-center justify-center max-w-sm w-full mx-auto gap-8 animate-float-in">
        <BrandLogo size="lg" />

        <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center animate-pulse-glow">
          <Lock className="w-9 h-9 text-primary" />
        </div>

        <div className="text-center space-y-1">
          <h2 className="font-display text-2xl">Gerbang Rahasia</h2>
          <p className="text-sm text-muted-foreground px-4">
            Masukkan kode akses untuk masuk ke ruang permainan.
          </p>
        </div>

        <form onSubmit={submit} className="w-full space-y-4">
          <Input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Kode akses"
            autoFocus
            className="h-12 text-center text-base bg-input border-border"
          />
          <PrimaryButton type="submit" disabled={loading || !code}>
            {loading ? "Memeriksa..." : "Masuk"}
          </PrimaryButton>
        </form>
      </div>
    </Screen>
  );
}
