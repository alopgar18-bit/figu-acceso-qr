import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  FIELD_DEFS,
  FIELD_GROUP_LABELS,
  type FieldDef,
  type FieldKey,
  type FieldRequirements,
  type FieldRule,
} from "@/lib/field-requirements";

export function FieldRequirementsEditor({
  value,
  onChange,
  disabled,
}: {
  value: FieldRequirements;
  onChange: (next: FieldRequirements) => void;
  disabled?: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<FieldDef["group"], FieldDef[]>();
    for (const d of FIELD_DEFS) {
      const arr = map.get(d.group) ?? [];
      arr.push(d);
      map.set(d.group, arr);
    }
    return Array.from(map.entries());
  }, []);

  const get = (key: FieldKey, attr: keyof FieldRule): boolean => {
    const v = value[key]?.[attr];
    if (typeof v === "boolean") return v;
    return FIELD_DEFS.find((d) => d.key === key)!.defaults[attr];
  };

  const set = (key: FieldKey, attr: keyof FieldRule, v: boolean) => {
    const def = FIELD_DEFS.find((d) => d.key === key)!;
    const current = {
      visible: get(key, "visible"),
      required: get(key, "required"),
      in_import: get(key, "in_import"),
      in_report: get(key, "in_report"),
    };
    const next = { ...current, [attr]: v };
    if (!next.visible) next.required = false;
    // Only persist deltas vs defaults
    const delta: Partial<FieldRule> = {};
    if (next.visible !== def.defaults.visible) delta.visible = next.visible;
    if (next.required !== def.defaults.required) delta.required = next.required;
    if (next.in_import !== def.defaults.in_import) delta.in_import = next.in_import;
    if (next.in_report !== def.defaults.in_report) delta.in_report = next.in_report;
    const out = { ...value };
    if (Object.keys(delta).length === 0) delete out[key];
    else out[key] = delta;
    onChange(out);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base uppercase tracking-wider">Campos del formulario y requisitos</CardTitle>
        <CardDescription>
          Define para este evento/sesión qué campos se muestran, son obligatorios, se usan en importación
          y se incluyen en informes. No hay obligatorios globales: aquí mandas tú.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {groups.map(([groupKey, defs]) => (
          <div key={groupKey} className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {FIELD_GROUP_LABELS[groupKey]}
            </div>
            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-[1fr_repeat(4,minmax(70px,80px))] gap-2 px-3 py-2 bg-muted/50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <div>Campo</div>
                <div className="text-center">Mostrar</div>
                <div className="text-center">Obligatorio</div>
                <div className="text-center">Importación</div>
                <div className="text-center">Informe</div>
              </div>
              {defs.map((d) => {
                const vis = get(d.key, "visible");
                return (
                  <div key={d.key} className="grid grid-cols-[1fr_repeat(4,minmax(70px,80px))] gap-2 px-3 py-2 items-center border-t">
                    <Label className="text-sm">{d.label}</Label>
                    <div className="flex justify-center"><Switch disabled={disabled} checked={vis} onCheckedChange={(v) => set(d.key, "visible", v)} /></div>
                    <div className="flex justify-center"><Switch disabled={disabled || !vis} checked={get(d.key, "required")} onCheckedChange={(v) => set(d.key, "required", v)} /></div>
                    <div className="flex justify-center"><Switch disabled={disabled} checked={get(d.key, "in_import")} onCheckedChange={(v) => set(d.key, "in_import", v)} /></div>
                    <div className="flex justify-center"><Switch disabled={disabled} checked={get(d.key, "in_report")} onCheckedChange={(v) => set(d.key, "in_report", v)} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}