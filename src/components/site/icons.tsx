// Le logo Android officiel (petit robot), dessiné en SVG pour rester net à toutes les tailles.
export function AndroidLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* antennes */}
      <path
        d="M7.2 2.2 8.7 4.9M16.8 2.2 15.3 4.9"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />
      {/* tête avec les yeux découpés (trous) */}
      <path
        fillRule="evenodd"
        d="M4 10.6a8 8 0 0 1 16 0ZM8.8 6.85a0.95 0.95 0 1 0 0 1.9 0.95 0.95 0 1 0 0-1.9ZM15.2 6.85a0.95 0.95 0 1 0 0 1.9 0.95 0.95 0 1 0 0-1.9Z"
      />
      {/* corps */}
      <rect x="4" y="11.4" width="16" height="8.6" rx="2" />
      {/* bras */}
      <rect x="1.1" y="11.4" width="2.3" height="7" rx="1.15" />
      <rect x="20.6" y="11.4" width="2.3" height="7" rx="1.15" />
      {/* jambes */}
      <rect x="6.8" y="19" width="2.6" height="4.6" rx="1.3" />
      <rect x="14.6" y="19" width="2.6" height="4.6" rx="1.3" />
    </svg>
  );
}
