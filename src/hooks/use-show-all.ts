import { useState } from "react";

/**
 * Helper para listados con tope inicial y opción "Ver todos".
 * - `visible(arr)` devuelve los elementos a renderizar.
 * - `showAll` indica si se muestran todos.
 * - `toggle()` alterna entre tope inicial y mostrar todos.
 */
export function useShowAll(initial = 500) {
  const [showAll, setShowAll] = useState(false);
  return {
    showAll,
    limit: initial,
    visible<T>(arr: T[]): T[] {
      return showAll ? arr : arr.slice(0, initial);
    },
    toggle: () => setShowAll((v) => !v),
    setShowAll,
  };
}