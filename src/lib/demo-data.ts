// FIKTIVE Demo-Daten, damit die Oberfläche ohne Datenbank funktioniert.
// Keine echten Drucksachen – Inhalte frei erfunden.
export type DemoDoc = {
  id: string; dokumentnummer: string; datum: string; titel: string; vorgangstyp: string;
  kfw: boolean; bmz: boolean; deskriptoren: string[]; text: string;
};

export const DEMO_DOCS: DemoDoc[] = [
  {
    id: "demo-1", dokumentnummer: "DEMO 1/001", datum: "2025-03-12",
    titel: "Zusagen der KfW Entwicklungsbank im Bereich erneuerbare Energien in Subsahara-Afrika",
    vorgangstyp: "Kleine Anfrage", kfw: true, bmz: true,
    deskriptoren: ["Entwicklungszusammenarbeit", "Erneuerbare Energie", "Afrika"],
    text: `1. Wie hoch waren die Neuzusagen der KfW Entwicklungsbank für erneuerbare Energien in Subsahara-Afrika in den Jahren 2020 bis 2024?
Die Neuzusagen der KfW Entwicklungsbank für Vorhaben im Bereich erneuerbare Energien in Subsahara-Afrika beliefen sich in den Jahren 2020 bis 2024 auf insgesamt rund 2,1 Mrd. Euro. Eine Aufschlüsselung nach Jahren ist in der Anlage 1 dargestellt.
2. Welche Länder erhielten die höchsten Zusagen?
Die höchsten Zusagen entfielen auf Kenia, Äthiopien und Südafrika.`,
  },
  {
    id: "demo-2", dokumentnummer: "DEMO 1/002", datum: "2024-06-04",
    titel: "Förderung von Klimaanpassung und Wasserversorgung durch die deutsche Entwicklungszusammenarbeit",
    vorgangstyp: "Kleine Anfrage", kfw: true, bmz: true,
    deskriptoren: ["Klimaschutz", "Wasserversorgung", "Entwicklungszusammenarbeit"],
    text: `1. Welche Vorhaben zur Wasserversorgung im Sahel hat die Bundesregierung seit 2019 über die KfW Entwicklungsbank finanziert?
Seit 2019 hat die Bundesregierung über die KfW Entwicklungsbank insgesamt 23 Vorhaben zur Wasserversorgung im Sahel mit einem Gesamtvolumen von 412 Mio. Euro finanziert.
2. Wie bewertet die Bundesregierung die Wirksamkeit dieser Vorhaben?
Nach den Schlussprüfungen wurden 78 Prozent der abgeschlossenen Vorhaben als erfolgreich bewertet.`,
  },
  {
    id: "demo-3", dokumentnummer: "DEMO 1/003", datum: "2023-09-21",
    titel: "Wirkungsmessung und Evaluierung von Vorhaben der Finanziellen Zusammenarbeit",
    vorgangstyp: "Große Anfrage", kfw: true, bmz: true,
    deskriptoren: ["Evaluierung", "Finanzielle Zusammenarbeit", "Entwicklungspolitik"],
    text: `1. Nach welchen Kriterien evaluiert die KfW Entwicklungsbank Vorhaben der Finanziellen Zusammenarbeit?
Die Evaluierung erfolgt nach den OECD-DAC-Kriterien Relevanz, Kohärenz, Effektivität, Effizienz, Impact und Nachhaltigkeit durch die unabhängige Evaluierungseinheit der KfW.
2. Wie oft werden Evaluierungsberichte veröffentlicht?
Die Evaluierungsberichte werden jährlich in zusammengefasster Form veröffentlicht.`,
  },
  {
    id: "demo-4", dokumentnummer: "DEMO 1/004", datum: "2025-08-30",
    titel: "Humanitäre Hilfe und Wiederaufbau in der Ukraine",
    vorgangstyp: "Kleine Anfrage", kfw: true, bmz: true,
    deskriptoren: ["Ukraine", "Wiederaufbau", "Humanitäre Hilfe"],
    text: `1. Welche Mittel hat die KfW im Auftrag des BMZ für den Wiederaufbau der Energieinfrastruktur in der Ukraine seit Februar 2022 bereitgestellt?
Seit Februar 2022 hat die KfW im Auftrag des BMZ rund 650 Mio. Euro für den Wiederaufbau der Energieinfrastruktur in der Ukraine zugesagt.
2. Wie viele Projekte befinden sich in der Umsetzung?
Derzeit befinden sich 17 Projekte in der Umsetzung.`,
  },
  {
    id: "demo-5", dokumentnummer: "DEMO 1/005", datum: "2022-11-15",
    titel: "Förderung von Kleinstunternehmen und Mikrofinanz in Südostasien",
    vorgangstyp: "Kleine Anfrage", kfw: true, bmz: false,
    deskriptoren: ["Mikrofinanz", "Südostasien", "Entwicklungsbank"],
    text: `1. Wie viele Mikrofinanzinstitute in Südostasien werden von der KfW Entwicklungsbank über Refinanzierungslinien unterstützt?
Die KfW Entwicklungsbank unterstützt derzeit 34 Mikrofinanzinstitute in Südostasien über Refinanzierungslinien.`,
  },
  {
    id: "demo-6", dokumentnummer: "DEMO 1/006", datum: "2024-02-19",
    titel: "Deutsche Beiträge zur internationalen Klimafinanzierung",
    vorgangstyp: "Kleine Anfrage", kfw: false, bmz: true,
    deskriptoren: ["Klimafinanzierung", "Haushalt", "Entwicklungszusammenarbeit"],
    text: `1. Wie hoch war der deutsche Beitrag zur internationalen Klimafinanzierung im Jahr 2023?
Die Bundesregierung stellte im Jahr 2023 insgesamt 5,7 Mrd. Euro aus Haushaltsmitteln für die internationale Klimafinanzierung bereit.`,
  },
];
