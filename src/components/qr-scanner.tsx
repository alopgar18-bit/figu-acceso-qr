import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff } from "lucide-react";

interface QrScannerProps {
  onResult: (text: string) => void;
  paused?: boolean;
}

export function QrScanner({ onResult, paused }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  useEffect(() => {
    if (!active || paused) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const back = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];
        if (!videoRef.current) return;
        const controls = await reader.decodeFromVideoDevice(back?.deviceId, videoRef.current, (result) => {
          if (!result || cancelled) return;
          const text = result.getText();
          const now = Date.now();
          if (text === lastRef.current.text && now - lastRef.current.at < 2500) return;
          lastRef.current = { text, at: now };
          onResult(text);
        });
        controlsRef.current = controls;
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo acceder a la cámara");
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [active, paused, onResult]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-center">
        <CameraOff className="mx-auto h-10 w-10 text-destructive mb-3" />
        <p className="text-sm font-medium text-destructive">{error}</p>
        <p className="text-xs text-muted-foreground mt-2">Comprueba permisos de cámara en el navegador.</p>
        <Button size="sm" className="mt-4" onClick={() => { setError(null); setActive(true); }}>Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-md bg-black aspect-square max-w-lg mx-auto">
      <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-3/4 h-3/4 border-2 border-white/70 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
      </div>
      <div className="absolute top-2 right-2">
        <Button size="sm" variant="secondary" onClick={() => setActive((v) => !v)}>
          <Camera className="h-4 w-4 mr-1" />{active ? "Pausar" : "Reanudar"}
        </Button>
      </div>
    </div>
  );
}

export function extractQrToken(text: string): string {
  // Accept full URL like /c/{token}/entrada or raw token
  try {
    const url = new URL(text);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("c");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    // Also support a ?t= query
    const qt = url.searchParams.get("t");
    if (qt) return qt;
  } catch {
    // not a URL
  }
  return text.trim();
}