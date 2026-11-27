import { dnd5eSheetSchema, type CampaignData, type ChatMessage, type Member } from "@mj-ia/shared";

/**
 * Tout ce qui ne doit jamais être recopié tel quel aux joueurs :
 * secrets du journal et entrées réservées au MJ.
 */
export function collectSecrets(data: CampaignData): string[] {
  const secrets: string[] = [];
  for (const entry of data.journal) {
    if (entry.gmNotes) secrets.push(entry.gmNotes);
    if (entry.visibility === "gm" && entry.content) secrets.push(entry.content);
  }
  return secrets;
}

function audience(message: ChatMessage, members: Member[]) {
  if (message.visibility === "all") return "public";
  if (message.visibility === "gm") return "privé, MJ seulement";
  const names = message.visibleTo.map((id) => members.find((m) => m.userId === id)?.name ?? "?");
  return `chuchoté à ${names.join(", ")}`;
}

/** Résumé lisible de la campagne et du chat récent, pour le prompt de l'IA (vue complète du MJ). */
export function renderCampaignContext(data: CampaignData, recent: ChatMessage[]): string {
  const { campaign, members, scenes, tokens, sheets, journal } = data;
  const name = (id: string | null) => members.find((m) => m.userId === id)?.name ?? "—";
  const lines: string[] = [];

  lines.push(`# Campagne « ${campaign.name} » (système : ${campaign.system})`);
  lines.push("", "## Membres");
  for (const m of members) lines.push(`- ${m.name} (id ${m.userId}) : ${m.role === "gm" ? "MJ humain" : m.role === "player" ? "joueur" : "spectateur"}`);

  lines.push("", "## Scènes");
  for (const s of scenes) {
    const active = s.id === campaign.activeSceneId ? " — SCÈNE ACTIVE, les joueurs la voient" : " — préparée, invisible des joueurs";
    lines.push(`- ${s.name} (id ${s.id}), grille ${s.width}×${s.height} cases${active}`);
    for (const t of tokens.filter((tk) => tk.sceneId === s.id)) {
      const flags = [
        t.hidden ? "CACHÉ aux joueurs" : null,
        t.controlledBy.length ? `contrôlé par ${t.controlledBy.map(name).join(", ")}` : null,
        t.sheetId ? `fiche ${t.sheetId}` : null,
      ].filter(Boolean);
      lines.push(`  - jeton « ${t.name} » (id ${t.id}) en case (${t.x}, ${t.y}), taille ${t.size}${flags.length ? ` ; ${flags.join(" ; ")}` : ""}`);
    }
  }

  lines.push("", "## Fiches");
  for (const s of sheets) {
    const parsed = dnd5eSheetSchema.safeParse(s.data);
    const d = parsed.success ? parsed.data : null;
    const owner = s.ownerId ? `PJ de ${name(s.ownerId)}` : "PNJ/monstre";
    const stats = d
      ? `${d.race} ${d.class} niv. ${d.level}, CA ${d.ac}, PV ${d.hp.current}/${d.hp.max}, FOR ${d.abilities.str} DEX ${d.abilities.dex} CON ${d.abilities.con} INT ${d.abilities.int} SAG ${d.abilities.wis} CHA ${d.abilities.cha}`
      : JSON.stringify(s.data);
    lines.push(`- ${s.name} (id ${s.id}, ${owner}) : ${stats}${d?.notes ? ` — notes : ${d.notes}` : ""}`);
  }

  lines.push("", "## Journal");
  for (const j of journal) {
    const vis = j.visibility === "all" ? "connu de tous" : j.visibility === "gm" ? "SECRET, MJ seulement" : `connu de ${j.visibleTo.map(name).join(", ")}`;
    lines.push(`### ${j.title} [${j.kind}, ${vis}]`);
    if (j.content) lines.push(j.content);
    if (j.gmNotes) lines.push(`SECRETS DU MJ : ${j.gmNotes}`);
  }

  const docs = data.assets.filter((a) => a.kind === "document");
  if (docs.length) {
    lines.push("", "## Documents de la bibliothèque (tu ne peux pas les lire, seulement y renvoyer les joueurs)");
    for (const d of docs) {
      const vis = d.visibility === "all" ? "tous les joueurs" : d.visibility === "gm" ? "MJ seulement" : d.visibleTo.map(name).join(", ");
      lines.push(`- ${d.name} (${vis})`);
    }
  }

  lines.push("", "## Chat récent (du plus ancien au plus récent)");
  for (const m of recent) {
    lines.push(`[${audience(m, members)}] ${m.speaker}${m.kind === "roll" ? " (jet)" : ""} : ${m.text}`);
  }
  return lines.join("\n");
}
