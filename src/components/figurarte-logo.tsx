import logoDark from "@/assets/figurarte-logo-dark.png";
import logoLight from "@/assets/figurarte-logo-light.png";
import taglineDark from "@/assets/figurarte-tagline-dark.png";
import taglineLight from "@/assets/figurarte-tagline-light.png";

interface FigurarteLogoProps {
  /** "dark" = for light backgrounds (dark text). "light" = for dark backgrounds (light text). */
  variant?: "light" | "dark";
  className?: string;
  showTagline?: boolean;
}

export function FigurarteLogo({ variant = "dark", className, showTagline = false }: FigurarteLogoProps) {
  const logo = variant === "light" ? logoLight : logoDark;
  const tagline = variant === "light" ? taglineLight : taglineDark;
  return (
    <div className={"flex flex-col gap-2 " + (className ?? "")}>
      <img
        src={logo}
        alt="FIGURARTE — Casting & Producción"
        loading="lazy"
        className="h-9 w-auto"
      />
      {showTagline && (
        <img
          src={tagline}
          alt="Agencia de casting & producción"
          loading="lazy"
          className="h-12 w-auto opacity-90"
        />
      )}
    </div>
  );
}