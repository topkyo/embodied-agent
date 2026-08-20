import type { ReactNode } from "react";

type StackCardProps = {
  num: string;
  title: string;
  children: ReactNode;
  className?: string;
};

export default function StackCard({ num, title, children, className = "" }: StackCardProps) {
  return (
    <article className={`stack-card ${className}`.trim()}>
      <p className="num">{num}</p>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}
