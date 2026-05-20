import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnboardingState } from "@/hooks/use-onboarding";
import {
  Building2,
  CalendarDays,
  Ticket,
  Globe,
  Inbox,
  CheckCircle2,
  Mail,
  ScanLine,
  BarChart3,
  Check,
  Circle,
  ArrowRight,
  Play,
  Sparkles,
} from "lucide-react";

const STEP_ICONS = [
  Building2,      // 1. Productora
  CalendarDays,   // 2. Evento
  Ticket,         // 3. Sesiones
  Globe,          // 4. Formulario público
  Inbox,          // 5. Solicitudes
  CheckCircle2,   // 6. Aprueba
  Mail,           // 7. Confirmación
  ScanLine,       // 8. QR
  BarChart3,      // 9. Informes
];

export function AdminOnboardingBlock() {
  const { data, isLoading } = useOnboardingState();
  const steps = data?.steps ?? [];
  const completed = data?.completedCount ?? 1;
  const total = data?.totalCount ?? 9;
  const demoEvent = data?.demoEvent;
  const progressPct = total > 1 ? Math.round((completed / total) * 100) : 0;

  if (isLoading) {
    return (
      <Card className="rounded-none border-2">
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (data?.isAllComplete) {
    return (
      <Card className="rounded-none border-2 border-green-200 bg-green-50/40">
        <CardContent className="p-6 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-700">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <div className="font-bold text-lg">Onboarding completado</div>
            <p className="text-sm text-muted-foreground">
              Has completado todos los pasos para gestionar un evento. ¡Felicidades!
            </p>
          </div>
          {demoEvent && (
            <Button asChild className="ml-auto" size="sm">
              <Link to="/eventos/$eventId" params={{ eventId: demoEvent.id }}>
                <Sparkles className="h-4 w-4 mr-1" /> Continuar con evento demo
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-none border-2">
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-black uppercase tracking-tight">
              Primeros pasos para gestionar un evento
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Sigue estos pasos para configurar tu primer evento en FIGURARTE Access.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-1">
            <div className="flex-1 md:w-48 h-2 bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <Badge variant={completed === total ? "default" : "secondary"} className="text-[10px] uppercase tracking-wider">
              {completed} / {total}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-6">
        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute left-[19px] top-8 bottom-4 w-px bg-border hidden md:block" />

          <div className="space-y-1">
            {steps.map((step, idx) => {
              const Icon = STEP_ICONS[idx] ?? Circle;
              const isDone = step.completed;
              const isNext = !isDone && (idx === 1 || steps[idx - 1]?.completed);

              return (
                <div
                  key={step.id}
                  className={`group flex items-start gap-4 p-3 rounded-lg transition-colors ${
                    isNext ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/30"
                  }`}
                >
                  {/* Step number / icon */}
                  <div className="relative shrink-0 hidden md:flex flex-col items-center">
                    <div
                      className={`h-10 w-10 flex items-center justify-center border-2 transition-colors ${
                        isDone
                          ? "bg-green-100 border-green-300 text-green-700"
                          : isNext
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-background border-muted-foreground/30 text-muted-foreground"
                      }`}
                    >
                      {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-bold uppercase tracking-tight ${
                          isDone ? "text-muted-foreground line-through" : "text-foreground"
                        }`}
                      >
                        {step.id}. {step.title}
                      </span>
                      {isDone && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 border-green-200 text-green-700 bg-green-50">
                          Completado
                        </Badge>
                      )}
                      {isNext && (
                        <Badge className="text-[10px] h-4 px-1">Siguiente paso</Badge>
                      )}
                    </div>

                    <div className="mt-1 flex items-center gap-2">
                      <Button
                        asChild
                        size="sm"
                        variant={isNext ? "default" : "outline"}
                        className="h-7 text-xs font-semibold"
                      >
                        <Link to={step.href}>
                          {isNext && <Play className="h-3 w-3 mr-1" />}
                          {step.cta}
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Demo event CTA */}
        {demoEvent && (
          <div className="mt-6 pt-4 border-t flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="h-10 w-10 bg-primary/10 flex items-center justify-center shrink-1">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">
                Continuar con evento demo
              </div>
              <p className="text-xs text-muted-foreground">
                Ya existe el evento <strong>{demoEvent.name}</strong>. Puedes explorar todas las funciones directamente.
              </p>
            </div>
            <Button asChild size="sm" className="shrink-1">
              <Link to="/eventos/$eventId" params={{ eventId: demoEvent.id }}>
                Ir a ficha del evento
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
