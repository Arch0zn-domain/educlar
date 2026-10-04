"use client";

import { useState } from "react";

type Tab = "profesori" | "licee" | "scoli" | "recenzii";
type Recenzie = { id: number; profesor: string; stele: number; text: string; likes: number };

const PROFESORI = [
  { id: 1, nume: "Prof. Demo Unu", materie: "Matematică", unitate: "Liceul Demo 1" },
  { id: 2, nume: "Prof. Demo Doi", materie: "Română", unitate: "Liceul Demo 2" },
  { id: 3, nume: "Prof. Demo Trei", materie: "Informatică", unitate: "Liceul Demo 1" },
  { id: 4, nume: "Prof. Demo Patru", materie: "Fizică", unitate: "Școala Demo 3" },
];
const LICEE = ["Liceul Demo 1", "Liceul Demo 2"];
const SCOLI = ["Școala Demo 3", "Școala Demo 4"];

const TABURI: { id: Tab; label: string }[] = [
  { id: "profesori", label: "👩‍🏫 Profesori" },
  { id: "licee", label: "🏫 Licee" },
  { id: "scoli", label: "🏠 Școli" },
  { id: "recenzii", label: "💬 Recenzii" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("profesori");
  const [cautare, setCautare] = useState("");
  const [filtru, setFiltru] = useState<string | null>(null);
  const [recenzii, setRecenzii] = useState<Recenzie[]>([
    { id: 1, profesor: "Prof. Demo Unu", stele: 5, text: "Explică clar și are răbdare cu întrebările.", likes: 3 },
    { id: 2, profesor: "Prof. Demo Doi", stele: 3, text: "Testele sunt grele, dar corecte la notare.", likes: 1 },
  ]);
  const [profSel, setProfSel] = useState(PROFESORI[0].nume);
  const [stele, setStele] = useState(5);
  const [text, setText] = useState("");

  const medie = (nume: string) => {
    const r = recenzii.filter((x) => x.profesor === nume);
    if (r.length === 0) return "–";
    return (r.reduce((s, x) => s + x.stele, 0) / r.length).toFixed(1);
  };

  const profesoriAfisati = PROFESORI.filter(
    (p) =>
      (!filtru || p.unitate === filtru) &&
      (p.nume + p.materie).toLowerCase().includes(cautare.toLowerCase())
  );

  const trimite = () => {
    if (text.trim().length < 10) return;
    setRecenzii([{ id: Date.now(), profesor: profSel, stele, text: text.trim(), likes: 0 }, ...recenzii]);
    setText("");
    setStele(5);
  };

  const like = (id: number) =>
    setRecenzii(recenzii.map((r) => (r.id === id ? { ...r, likes: r.likes + 1 } : r)));

  const deschideUnitate = (nume: string) => {
    setFiltru(nume);
    setTab("profesori");
  };

  const clsTab = (activ: boolean) =>
    activ
      ? "px-4 py-2 rounded-full text-sm font-medium bg-indigo-600 text-white"
      : "px-4 py-2 rounded-full text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200";

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 px-6 py-5">
        <h1 className="text-2xl font-bold">NumeleApp</h1>
        <p className="text-slate-500 text-sm">Feedback structurat de la elevi, fără insulte.</p>
      </header>

      <nav className="flex flex-wrap gap-2 px-6 py-4">
        {TABURI.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={clsTab(tab === t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <section className="px-6 pb-16 max-w-3xl">
        {tab === "profesori" && (
          <div className="space-y-4">
            <input
              value={cautare}
              onChange={(e) => setCautare(e.target.value)}
              placeholder="Caută profesor sau materie..."
              className="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:border-indigo-500"
            />
            {filtru && (
              <button
                onClick={() => setFiltru(null)}
                className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full"
              >
                {filtru} ✕
              </button>
            )}
            {profesoriAfisati.map((p) => (
              <div
                key={p.id}
                className="border border-slate-200 rounded-2xl p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold">{p.nume}</p>
                  <p className="text-sm text-slate-500">
                    {p.materie} · {p.unitate}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-amber-500">★ {medie(p.nume)}</span>
                  <button
                    onClick={() => {
                      setProfSel(p.nume);
                      setTab("recenzii");
                    }}
                    className="bg-indigo-600 text-white text-sm px-3 py-2 rounded-lg"
                  >
                    Scrie recenzie
                  </button>
                </div>
              </div>
            ))}
            {profesoriAfisati.length === 0 && <p className="text-slate-500">Niciun rezultat.</p>}
          </div>
        )}

        {(tab === "licee" || tab === "scoli") && (
          <div className="grid gap-4 sm:grid-cols-2">
            {(tab === "licee" ? LICEE : SCOLI).map((u) => (
              <button
                key={u}
                onClick={() => deschideUnitate(u)}
                className="text-left border border-slate-200 rounded-2xl p-5 hover:border-indigo-500 hover:shadow-md"
              >
                <p className="font-semibold">{u}</p>
                <p className="text-sm text-slate-500">
                  {PROFESORI.filter((p) => p.unitate === u).length} profesori · vezi lista →
                </p>
              </button>
            ))}
          </div>
        )}

        {tab === "recenzii" && (
          <div className="space-y-6">
            <div className="border border-slate-200 rounded-2xl p-4 space-y-3">
              <p className="font-semibold">Adaugă o recenzie</p>
              <select
                value={profSel}
                onChange={(e) => setProfSel(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              >
                {PROFESORI.map((p) => (
                  <option key={p.id}>{p.nume}</option>
                ))}
              </select>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setStele(n)}
                    className={n <= stele ? "text-2xl text-amber-400" : "text-2xl text-slate-300"}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Descrie ce a mers bine și ce se poate îmbunătăți (fără insulte)..."
                rows={3}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
              />
              <button
                onClick={trimite}
                disabled={text.trim().length < 10}
                className="bg-indigo-600 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg font-medium"
              >
                Trimite
              </button>
            </div>

            {recenzii.map((r) => (
              <div key={r.id} className="border border-slate-200 rounded-2xl p-4">
                <div className="flex justify-between">
                  <p className="font-semibold">{r.profesor}</p>
                  <p className="text-amber-500">{"★".repeat(r.stele)}</p>
                </div>
                <p className="text-slate-700 mt-1">{r.text}</p>
                <button
                  onClick={() => like(r.id)}
                  className="mt-2 text-sm text-slate-500 hover:text-indigo-600"
                >
                  👍 Util ({r.likes})
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-slate-200 px-6 py-4 text-xs text-slate-400">
        Date fictive pentru demo.
      </footer>
    </main>
  );
}