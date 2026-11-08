export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <img
      src="/branding/chtaw-logo.png"
      alt="Team Chtaw"
      width={880}
      height={490}
      className={`brand-logo ${className}`.trim()}
    />
  );
}
