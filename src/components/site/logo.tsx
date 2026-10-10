import { useTranslations } from "next-intl";
import Image from "next/image";

/**
 * Approved brand logo (Constitution XIII / US12.3): served from the
 * byte-identical copy in /public via next/image — never regenerated,
 * recolored, or distorted. The alt text is the working-default company
 * name pending client confirmation (Open Item 1).
 */
export function Logo({
  className = "h-9 w-auto",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  const t = useTranslations("footer");

  return (
    <Image
      src="/logo.png"
      alt={t("companyName")}
      width={378}
      height={74}
      priority={priority}
      loading="eager"
      className={className}
    />
  );
}
