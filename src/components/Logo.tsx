import Link from "next/link";

export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="8.5" height="8.5" rx="2.2" fill="#C6F24E" />
      <rect x="13" y="2.5" width="8.5" height="8.5" rx="2.2" stroke="#C6F24E" strokeWidth="1.8" />
      <rect x="2.5" y="13" width="19" height="8.5" rx="2.2" stroke="#C6F24E" strokeWidth="1.8" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight text-white" aria-label="devit home">
      <LogoMark />
      devit
    </Link>
  );
}
