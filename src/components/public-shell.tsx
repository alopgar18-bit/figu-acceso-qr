import { Link } from "@tanstack/react-router";
import { FigurarteLogo } from "@/components/figurarte-logo";
import type { ReactNode } from "react";

export function PublicShell({ children, brandColor }: { children: ReactNode; brandColor?: string | null }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b" style={brandColor ? { borderBottomColor: brandColor } : undefined}>
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
          <Link to="/"><FigurarteLogo /></Link>
          <Link to="/privacidad" className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
            Privacidad
          </Link>
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-10">{children}</main>
      <footer className="border-t mt-12">
        <div className="max-w-3xl mx-auto px-4 py-6 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>© FIGURARTE Casting &amp; Producción</span>
          <Link to="/privacidad" className="hover:text-foreground">Política de privacidad</Link>
        </div>
      </footer>
    </div>
  );
}