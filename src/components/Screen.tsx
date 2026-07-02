import type { ReactNode } from "react";

interface ScreenProps {
  children: ReactNode;
  className?: string;
}

export function Screen({ children, className = "" }: ScreenProps) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <main className={`flex-1 flex flex-col px-4 py-6 sm:px-6 ${className}`}>
        {children}
      </main>
      <Footer />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="py-3 text-center text-xs text-muted-foreground">
      Dikembangkan oleh <span className="text-primary font-semibold">Arsepat</span>
    </footer>
  );
}

export function BrandLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "text-2xl",
    md: "text-4xl sm:text-5xl",
    lg: "text-5xl sm:text-6xl",
  };
  return (
    <div className="text-center select-none">
      <h1 className={`font-display font-bold ${sizes[size]} leading-none`}>
        <span className="text-primary">Ske</span>
        <span className="text-foreground">Ber</span>
      </h1>
      <p className="mt-1 text-xs sm:text-sm text-muted-foreground tracking-wide">
        Tulis · Gambar · Tebak · Tertawa
      </p>
    </div>
  );
}

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-base btn-glow transition-opacity hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none [&_svg]:w-5 [&_svg]:h-5 ${className}`}
      style={{
        backgroundColor: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-base border-2 transition-colors hover:bg-primary/10 disabled:opacity-50 disabled:pointer-events-none [&_svg]:w-5 [&_svg]:h-5 ${className}`}
      style={{
        borderColor: "hsl(var(--primary) / 0.6)",
        color: "hsl(var(--primary))",
        backgroundColor: "transparent",
      }}
    >
      {children}
    </button>
  );
}
