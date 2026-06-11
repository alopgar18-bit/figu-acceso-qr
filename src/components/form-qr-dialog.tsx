import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export function FormQrDialog({ url, title }: { url: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: "M" })
      .then(setDataUrl).catch(() => setDataUrl(""));
  }, [open, url]);

  function download() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    a.click();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Ver QR del formulario">
          <QrCode className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>QR del formulario</DialogTitle>
          <DialogDescription className="break-all">{url}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          {dataUrl ? (
            <img src={dataUrl} alt={`QR ${title}`} className="w-72 h-72 border rounded" />
          ) : (
            <div className="w-72 h-72 flex items-center justify-center bg-muted rounded">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
          <Button onClick={download} disabled={!dataUrl} variant="outline">
            <Download className="h-4 w-4 mr-2" />Descargar PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}