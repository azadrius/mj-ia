import type { CampaignMode, CampaignView, Role, Token } from "@mj-ia/shared";
import { useEffect, useState } from "react";
import { api } from "../api";

const MODES: Record<CampaignMode, string> = {
  human: "MJ humain",
  ai_assistant: "MJ humain + IA assistante",
  ai_gm: "MJ IA autonome",
};

const ROLES: Record<Role, string> = { gm: "MJ", player: "Joueur", spectator: "Spectateur" };

/** Outils réservés au MJ : scènes, jetons, membres. */
export function GmPanel({ view, selected, sceneId, onSceneView }: {
  view: CampaignView;
  selected: Token | null;
  sceneId: string | null;
  onSceneView: (id: string) => void;
}) {
  return (
    <>
      {selected && <TokenEditor key={selected.id} view={view} token={selected} />}
      <ScenesSection view={view} sceneId={sceneId} onSceneView={onSceneView} />
      {sceneId && <NewTokenSection view={view} sceneId={sceneId} />}
      <MembersSection view={view} />
    </>
  );
}

function ScenesSection({ view, sceneId, onSceneView }: { view: CampaignView; sceneId: string | null; onSceneView: (id: string) => void }) {
  const { campaign } = view;
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [width, setWidth] = useState(20);
  const [height, setHeight] = useState(15);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const mapUrl = file ? (await api.upload(campaign.id, file)).url : null;
      const { id } = await api.post<{ id: string }>(`/campaigns/${campaign.id}/scenes`, { name, mapUrl, width, height });
      setName("");
      setFile(null);
      onSceneView(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3>Scènes</h3>
      <ul className="list">
        {view.scenes.map((s) => (
          <li key={s.id} className={s.id === sceneId ? "current" : ""}>
            <button className="link" onClick={() => onSceneView(s.id)}>{s.name}</button>
            {s.id === campaign.activeSceneId ? (
              <small className="badge">joueurs ici</small>
            ) : (
              <button
                className="small"
                onClick={() => api.patch(`/campaigns/${campaign.id}`, { activeSceneId: s.id })}
                title="Les joueurs voient uniquement la scène active"
              >
                Y amener les joueurs
              </button>
            )}
          </li>
        ))}
      </ul>
      <details>
        <summary>Nouvelle scène</summary>
        <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <label>Carte (image)<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <div className="row">
          <label>Largeur (cases)<input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} /></label>
          <label>Hauteur (cases)<input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} /></label>
        </div>
        <button onClick={create} disabled={!name.trim() || busy}>Créer la scène</button>
      </details>
    </div>
  );
}

function NewTokenSection({ view, sceneId }: { view: CampaignView; sceneId: string }) {
  const [sheetId, setSheetId] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#c0392b");
  const [hidden, setHidden] = useState(false);

  const add = async () => {
    const sheet = view.sheets.find((s) => s.id === sheetId);
    await api.post(`/campaigns/${view.campaign.id}/tokens`, {
      sceneId,
      name: name.trim() || sheet?.name || "Jeton",
      color,
      hidden,
      sheetId: sheet?.id ?? null,
      // Un jeton lié à la fiche d'un joueur est contrôlé par ce joueur.
      controlledBy: sheet?.ownerId ? [sheet.ownerId] : [],
    });
    setName("");
  };

  return (
    <div className="panel">
      <details>
        <summary>Ajouter un jeton</summary>
        <select value={sheetId} onChange={(e) => setSheetId(e.target.value)}>
          <option value="">Sans fiche</option>
          {view.sheets.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input placeholder="Nom (facultatif si lié à une fiche)" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="row">
          <label>Couleur<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
          <label className="inline"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Caché aux joueurs</label>
        </div>
        <button onClick={add}>Placer sur la carte</button>
      </details>
    </div>
  );
}

function TokenEditor({ view, token }: { view: CampaignView; token: Token }) {
  const base = `/campaigns/${view.campaign.id}/tokens/${token.id}`;
  const [name, setName] = useState(token.name);
  const [size, setSize] = useState(token.size);
  useEffect(() => setName(token.name), [token.name]);
  const players = view.members.filter((m) => m.role === "player");
  const patch = (body: Partial<Token>) => api.patch(base, body);

  return (
    <div className="panel selected">
      <div className="panel-head">
        <h3>Jeton sélectionné</h3>
        <button className="danger" onClick={() => confirm(`Retirer ${token.name} ?`) && api.del(base)}>Retirer</button>
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== token.name && patch({ name })} />
      <div className="row">
        <label>Taille (cases)
          <select value={size} onChange={(e) => { const v = Number(e.target.value); setSize(v); patch({ size: v }); }}>
            {[0.5, 1, 2, 3, 4].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label>Couleur<input type="color" defaultValue={token.color} onBlur={(e) => patch({ color: e.target.value })} /></label>
      </div>
      <label className="inline">
        <input type="checkbox" checked={token.hidden} onChange={(e) => patch({ hidden: e.target.checked })} /> Caché aux joueurs
      </label>
      <fieldset>
        <legend>Peut le déplacer</legend>
        {players.length === 0 && <small className="muted">Aucun joueur pour l'instant.</small>}
        {players.map((p) => (
          <label key={p.userId} className="inline">
            <input
              type="checkbox"
              checked={token.controlledBy.includes(p.userId)}
              onChange={(e) =>
                patch({
                  controlledBy: e.target.checked
                    ? [...token.controlledBy, p.userId]
                    : token.controlledBy.filter((id) => id !== p.userId),
                })
              }
            />
            {p.name}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

function MembersSection({ view }: { view: CampaignView }) {
  const { campaign, members, me } = view;
  const inviteLink = `${location.origin}/#/join/${campaign.inviteCode}`;
  return (
    <div className="panel">
      <h3>Table</h3>
      <label>
        Mode
        <select value={campaign.mode} onChange={(e) => api.patch(`/campaigns/${campaign.id}`, { mode: e.target.value })}>
          {Object.entries(MODES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </label>
      <small className="muted">Les modes IA arriveront à l'étape 2.</small>
      <label>
        Lien d'invitation
        <input readOnly value={inviteLink} onFocus={(e) => e.target.select()} />
      </label>
      <button className="small" onClick={() => api.patch(`/campaigns/${campaign.id}`, { regenerateInvite: true })}>
        Nouveau lien
      </button>
      <ul className="list">
        {members.map((m) => (
          <li key={m.userId}>
            <span>{m.name}</span>
            {m.userId === me.userId ? (
              <small className="badge">{ROLES[m.role]}</small>
            ) : (
              <select
                value={m.role}
                onChange={(e) => api.patch(`/campaigns/${campaign.id}/members/${m.userId}`, { role: e.target.value })}
              >
                {Object.entries(ROLES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
