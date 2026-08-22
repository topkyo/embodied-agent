export type LoopStep = {
  index: string;
  title: string;
  description: string;
};

type LoopStripProps = {
  steps: LoopStep[];
  className?: string;
};

export default function LoopStrip({ steps, className = "" }: LoopStripProps) {
  return (
    <div className={`loop-strip ${className}`.trim()}>
      {steps.map((step) => (
        <div className="loop-step" key={step.index}>
          <span>{step.index}</span>
          <strong>{step.title}</strong>
          <p>{step.description}</p>
        </div>
      ))}
    </div>
  );
}
