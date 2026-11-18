"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Anfragen-Check" },
  { href: "/stoebern", label: "Antworten durchsuchen" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="nav">
      <Link href="/" className="logo"><i aria-hidden>§</i> Anfragen-Check</Link>
      <nav aria-label="Hauptnavigation">
        {items.map((i) => (
          <Link key={i.href} href={i.href} aria-current={path === i.href ? "page" : undefined}>{i.label}</Link>
        ))}
      </nav>
    </header>
  );
}
