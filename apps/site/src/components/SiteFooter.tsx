import type { ReactNode } from "react";

type SiteFooterProps = {
  left: ReactNode;
  right?: ReactNode;
};

export default function SiteFooter({ left, right }: SiteFooterProps) {
  return (
    <footer className="site-footer">
      <span>{left}</span>
      {right ? <span>{right}</span> : null}
    </footer>
  );
}
