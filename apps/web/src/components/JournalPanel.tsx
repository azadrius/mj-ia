import { isGm, type CampaignView, type JournalEntry, type JournalKind, type Visibility } from "@mj-ia/shared";
import { useState } from "react";
import { api } from "../api";
import { VisibilityPicker } from "./VisibilityPicker";

const KINDS: Record<JournalKind, string> = {
  place: "Lieu",
  npc: "PNJ",
  quest: "Quête",
  handout: "Document",
  session: "Résumé de séance",
  note: "Note",
};

export function JournalPanel({ view }: { view: CampaignView }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const gm = isGm(view.me);
  const open = view.journal.find((j) => j.id === openId);

  if (creating || open) {
    return (
      <EntryEditor
        key={open?.id ?? "new"}
        view={view}
        entry={open}
        onClose={() => {
          setCreating(false);
          setOpenId(null);
        }}
      />
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Journal</h3>
        {gm && <button onClick={() => setCreating(true)}>+ Entrée</button>}
      </div>
      {view.journal.length === 0 && <p className="muted">Rien pour l'instant.</p>}
      <ul className="list">
        {view.journal.map((j) => (
          <li key={j.id}>
            <button className="link" onClick={() => setOpenId(j.id)}>
              {j.title}
            </button>
            <small className="muted">
              {KINDS[j.kind]}
              {gm && j.visibility === "gm" && " · privé"}
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntryEditor({ view, entry, onClose }: { view: CampaignView; entry?: JournalEntry; onClose: () => void }) {
  const gm = isGm(view.me);
  const [kind, setKind] = useState<JournalKind>(entry?.kind ?? "note");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [content, setContent] = useState(entry?.content ?? "");
  const [gmNotes, setGmNotes] = useState(entry?.gmNotes ?? "");
  const [visibility, setVisibility] = useState<Visibility>(entry?.visibility ?? "gm");
  const [visibleTo, setVisibleTo] = useState(entry?.visibleTo ?? []);
  const base = `/campaigns/${view.campaign.id}/journal`;

  if (!gm && entry) {
    return (
      <div className="panel">
        <button className="link" onClick={onClose}>← Journal</button>
        <h3>{entry.title}</h3>
        <small className="muted">{KINDS[entry.kind]}</small>
        <p className="prose">{entry.content}</p>
      </div>
    );
  }

  const save = async () => {
    const body = { kind, title, content, gmNotes: gmNotes || null, visibility, visibleTo };
    if (entry) await api.patch(`${base}/${entry.id}`, body);
    else await api.post(base, body);
    onClose();
  };

  const remove = async () => {
    if (entry && confirm(`Supprimer « ${entry.title} » ?`)) {
      await api.del(`${base}/${entry.id}`);
      onClose();
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <button className="link" onClick={onClose}>← Journal</button>
        {entry && <button className="danger" onClick={remove}>Supprimer</button>}
      </div>
      <input className="title" placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
      <select value={kind} onChange={(e) => setKind(e.target.value as JournalKind)}>
        {Object.entries(KINDS).map(([k, label]) => (
          <option key={k} value={k}>{label}</option>
        ))}
      </select>
      <label>
        Contenu (montré aux joueurs qui y ont accès)
        <textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} />
      </label>
      <label>
        Secrets du MJ (jamais montrés aux joueurs)
        <textarea rows={4} className="secret" value={gmNotes} onChange={(e) => setGmNotes(e.target.value)} />
      </label>
      <VisibilityPicker
        members={view.members}
        visibility={visibility}
        visibleTo={visibleTo}
        onChange={(v, to) => {
          setVisibility(v);
          setVisibleTo(to);
        }}
      />
      <button onClick={save} disabled={!title.trim()}>Enregistrer</button>
    </div>
  );
}
