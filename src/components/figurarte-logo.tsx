import wordmark from "@/assets/figurarte-wordmark.png";

interface FigurarteLogoProps {
  variant?: "light" | "dark";
  className?: string;
}

export function FigurarteLogo({ variant = "dark", className }: FigurarteLogoProps) {
  return (
    <div className={className}>
      <img
        src={wordmark}
        alt="FIGURARTE"
        width={1536}
        height={1024}
        loading="lazy"
        className={
          "h-9 w-auto " +
          (variant === "light" ? "invert brightness-0 contrast-200" : "")
        }
      />
    </div>
  );
}