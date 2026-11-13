// The Paper design's marks, drawn as it draws them.

interface IconProps {
  className?: string;
}

export const Mark = ({ className }: IconProps) => (
  <svg
    aria-hidden
    className={className}
    fill="none"
    height="22"
    viewBox="0 0 22 22"
    width="22"
  >
    <path
      d="M11 2.5c4.7 0 8.5 3.6 8.5 8.3 0 4.8-3.9 8.7-8.6 8.7-4.6 0-8.4-3.7-8.4-8.4C2.5 6.3 6.3 2.5 11 2.5Z"
      stroke="var(--color-ink)"
      strokeWidth="1.5"
    />
    <path
      d="M11 6.6c2.5 0 4.4 1.9 4.4 4.3 0 2.5-2 4.5-4.5 4.5-2.4 0-4.3-1.9-4.3-4.3 0-2.6 1.9-4.5 4.4-4.5Z"
      stroke="var(--color-map-blue)"
      strokeWidth="1.5"
    />
    <circle cx="11" cy="11" fill="var(--color-ink)" r="1.4" />
  </svg>
);

export const AgentMark = () => (
  <span className="bg-ink flex size-5 shrink-0 items-center justify-center rounded-full">
    <svg aria-hidden fill="none" height="11" viewBox="0 0 22 22" width="11">
      <path
        d="M11 2.5c4.7 0 8.5 3.6 8.5 8.3 0 4.8-3.9 8.7-8.6 8.7-4.6 0-8.4-3.7-8.4-8.4C2.5 6.3 6.3 2.5 11 2.5Z"
        stroke="#FFFFFF"
        strokeWidth="2"
      />
      <circle cx="11" cy="11" fill="#FFFFFF" r="2" />
    </svg>
  </span>
);

export const Chevron = ({ open = false }: { open?: boolean }) => (
  <svg
    aria-hidden
    className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    fill="none"
    height="10"
    viewBox="0 0 10 10"
    width="10"
  >
    <path
      d="M2.5 4l2.5 2.5L7.5 4"
      stroke="var(--color-graphite)"
      strokeLinecap="round"
      strokeWidth="1.2"
    />
  </svg>
);

export const Plus = () => (
  <svg aria-hidden fill="none" height="14" viewBox="0 0 14 14" width="14">
    <path
      d="M7 2v10M2 7h10"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.5"
    />
  </svg>
);

export const Tick = ({ className }: IconProps) => (
  <svg
    aria-hidden
    className={className}
    fill="none"
    height="14"
    viewBox="0 0 14 14"
    width="14"
  >
    <path
      d="M3 7.2l2.6 2.5L11 4.5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);

export const StepDone = () => (
  <svg aria-hidden fill="none" height="16" viewBox="0 0 20 20" width="16">
    <circle cx="10" cy="10" fill="var(--color-ink)" r="9" />
    <path
      d="M6 10.2l2.7 2.6L14 7.5"
      stroke="#FFFFFF"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
    />
  </svg>
);

export const StepRunning = () => (
  <svg
    aria-hidden
    className="animate-spin-slow"
    fill="none"
    height="16"
    viewBox="0 0 20 20"
    width="16"
  >
    <circle
      cx="10"
      cy="10"
      r="8.25"
      stroke="var(--color-contour)"
      strokeWidth="2"
    />
    <path
      d="M10 1.75A8.25 8.25 0 0 1 18.25 10"
      stroke="var(--color-map-blue)"
      strokeLinecap="round"
      strokeWidth="2"
    />
  </svg>
);

export const StepWaiting = () => (
  <svg aria-hidden fill="none" height="16" viewBox="0 0 20 20" width="16">
    <circle
      cx="10"
      cy="10"
      r="8.25"
      stroke="var(--color-rule-strong)"
      strokeDasharray="2.5 2.5"
      strokeWidth="1.5"
    />
  </svg>
);

export const StepFailed = () => (
  <svg aria-hidden fill="none" height="16" viewBox="0 0 20 20" width="16">
    <circle
      cx="10"
      cy="10"
      fill="var(--color-error-wash)"
      r="9"
      stroke="var(--color-error-rule)"
    />
    <path
      d="M7 7l6 6M13 7l-6 6"
      stroke="var(--color-error)"
      strokeLinecap="round"
      strokeWidth="1.6"
    />
  </svg>
);

export const Clock = () => (
  <svg
    aria-hidden
    className="shrink-0"
    fill="none"
    height="16"
    viewBox="0 0 16 16"
    width="16"
  >
    <circle
      cx="8"
      cy="8"
      r="6.5"
      stroke="var(--color-graphite)"
      strokeWidth="1.2"
    />
    <path
      d="M8 4.5V8l2.4 1.6"
      stroke="var(--color-graphite)"
      strokeLinecap="round"
      strokeWidth="1.2"
    />
  </svg>
);

export const Eye = () => (
  <span className="bg-contour flex size-8 shrink-0 items-center justify-center rounded-full">
    <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z"
        stroke="var(--color-map-blue)"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="8" fill="var(--color-map-blue)" r="2" />
    </svg>
  </span>
);

export const Menu = () => (
  <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
    <path
      d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"
      stroke="var(--color-ink)"
      strokeLinecap="round"
      strokeWidth="1.5"
    />
  </svg>
);
