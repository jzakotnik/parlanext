"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Anfragen-Check" },
  { href: "/stoebern", label: "Antworten durchsuchen" },
  { href: "/index-status", label: "Index" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="nav">
      <Link href="/" className="logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" width={36} height={36} alt="" />
        Anfragen-Check
      </Link>
      <nav aria-label="Hauptnavigation">
        {items.map((i) => (
          <Link key={i.href} href={i.href} aria-current={path === i.href ? "page" : undefined}>{i.label}</Link>
        ))}
      </nav>
    </header>
  );
}
