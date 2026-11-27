import { useEffect, useState } from "react";
import { api } from "../api";

interface UsageReport {
  sessions: { day: string; narrationChars: number; npcChars: number; aiTurns: number; inputTokens: number; outputTokens: number; aiCostUsd: number | null }[];
  month: { narrationChars: number; npcChars: number; aiCostUsd: number | null; elevenLabsPlanAll: string; elevenLabsPlanNpcOnly: string };
}

const n = (v: number) => v.toLocaleString("fr-FR");
const usd = (v: number | null) => (v === null ? "?" : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} $`);

/** Consommation réelle : caractères lus et coût de l'IA, pour choisir une offre de voix. */
export function UsagePanel({ campaignId }: { campaignId: string }) {
  const [report, setReport] = useState<UsageReport | null>(null);
  const load = () => api.get<UsageReport>(`/campaigns/${campaignId}/usage`).then(setReport).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  return (
    <div className="panel">
      <details onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()}>
        <summary>Consommation (30 derniers jours)</summary>
        {!report || report.sessions.length === 0 ? (
          <p className="muted">Rien de mesuré pour l'instant : l'IA n'a pas encore parlé.</p>
        ) : (
          <>
            <table className="usage">
              <thead>
                <tr><th>Séance</th><th>Narration</th><th>PNJ</th><th>Tours IA</th><th>Coût IA</th></tr>
              </thead>
              <tbody>
                {report.sessions.map((s) => (
                  <tr key={s.day}>
                    <td>{new Date(s.day).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</td>
                    <td>{n(s.narrationChars)}</td>
                    <td>{n(s.npcChars)}</td>
                    <td>{s.aiTurns}</td>
                    <td>{usd(s.aiCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Total lu : <strong>{n(report.month.narrationChars + report.month.npcChars)}</strong> caractères
              ({n(report.month.npcChars)} pour les PNJ). Coût IA estimé : <strong>{usd(report.month.aiCostUsd)}</strong>.
            </p>
            <p className="muted">
              Offre ElevenLabs suffisante sur 30 jours : {report.month.elevenLabsPlanAll} pour tout lire,
              {" "}{report.month.elevenLabsPlanNpcOnly} pour les PNJ seulement. Tarifs relevés en octobre 2026, à vérifier.
            </p>
          </>
        )}
      </details>
    </div>
  );
}
