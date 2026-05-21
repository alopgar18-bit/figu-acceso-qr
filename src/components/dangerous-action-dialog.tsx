import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  /** When >10 affected rows we require typing the confirmation word. */
  affectedCount: number;
  confirmWord?: string;
  destructiveLabel?: string;
  loading?: boolean;
  onConfirm: () => Promise<void> | void;
}

export function DangerousActionDialog({
  open,
  onOpenChange,
  title,
  description,
  affectedCount,
  confirmWord = "BORRAR",
  destructiveLabel = "Eliminar",
  loading,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState("");
  const needsTyping = affectedCount > 10;
  const canConfirm = !needsTyping || typed === confirmWord;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTyped("");
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {needsTyping && (
          <div className="space-y-2">
            <Label htmlFor="confirm-word" className="text-xs">
              Escribe <span className="font-mono font-semibold">{confirmWord}</span> para confirmar
            </Label>
            <Input
              id="confirm-word"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmWord}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm || loading}
            onClick={async (e) => {
              e.preventDefault();
              await onConfirm();
              setTyped("");
              onOpenChange(false);
            }}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {loading ? "Procesando…" : destructiveLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}