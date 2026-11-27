import {
  gridFromImage,
  isUniversalVttFile,
  parseUniversalVtt,
  type CampaignMode,
  type CampaignView,
  type Role,
  type Token,
} from "@mj-ia/shared";
import { useEffect, useState } from "react";
import { api } from "../api";
import { TokenImagePicker } from "./LibraryPanel";
import { UsagePanel } from "./UsagePanel";

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
      <UsagePanel campaignId={view.campaign.id} />
    </>
  );
}

/** Taille en pixels d'une image (pour en déduire la grille). */
function imageSize(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = src;
  });
}

function base64ToFile(b64: string, mime: string, name: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: mime });
}

function ScenesSection({ view, sceneId, onSceneView }: { view: CampaignView; sceneId: string | null; onSceneView: (id: string) => void }) {
  const { campaign } = view;
  const maps = view.assets.filter((a) => a.kind === "map");
  const [name, setName] = useState("");
  // Carte choisie : un fichier à envoyer, ou une image déjà dans la bibliothèque.
  const [file, setFile] = useState<File | null>(null);
  const [libraryUrl, setLibraryUrl] = useState("");
  const [pixels, setPixels] = useState<{ width: number; height: number } | null>(null);
  const [perCell, setPerCell] = useState(70);
  const [width, setWidth] = useState(20);
  const [height, setHeight] = useState(15);
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const applyGrid = (px: { width: number; height: number } | null, cell: number) => {
    if (!px) return;
    const grid = gridFromImage(px.width, px.height, cell);
    setWidth(grid.width);
    setHeight(grid.height);
  };

  const pickFile = async (f: File | undefined) => {
    setError("");
    setInfo("");
    setLibraryUrl("");
    if (!f) return setFile(null);
    try {
      if (isUniversalVttFile(f.name)) {
        // Dungeondraft, Dungeon Alchemist… : la grille est dans le fichier.
        const vtt = parseUniversalVtt(JSON.parse(await f.text()));
        const ext = vtt.mime.split("/")[1].replace("jpeg", "jpg");
        const image = base64ToFile(vtt.imageBase64, vtt.mime, f.name.replace(/\.[^.]+$/, `.${ext}`));
        setFile(image);
        setPixels(null);
        setWidth(vtt.width);
        setHeight(vtt.height);
        if (vtt.pixelsPerCell) setPerCell(vtt.pixelsPerCell);
        setInfo(`Fichier VTT : grille de ${vtt.width} × ${vtt.height} cases lue dans le fichier.`);
      } else {
        const url = URL.createObjectURL(f);
        const px = await imageSize(url);
        URL.revokeObjectURL(url);
        setFile(f);
        setPixels(px);
        applyGrid(px, perCell);
        setInfo(`Image de ${px.width} × ${px.height} pixels.`);
      }
      if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    } catch (e) {
      setFile(null);
      setError((e as Error).message);
    }
  };

  const pickLibrary = async (url: string) => {
    setFile(null);
    setLibraryUrl(url);
    setInfo("");
    if (!url) return;
    const asset = maps.find((m) => m.url === url);
    if (asset && !name.trim()) setName(asset.name);
    const px = await imageSize(url).catch(() => null);
    setPixels(px);
    applyGrid(px, perCell);
    if (px) setInfo(`Image de ${px.width} × ${px.height} pixels.`);
  };

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const mapUrl = file ? (await api.uploadAsset(campaign.id, "map", file)).url : libraryUrl || null;
      const { id } = await api.post<{ id: string }>(`/campaigns/${campaign.id}/scenes`, { name, mapUrl, width, height });
      setName("");
      setFile(null);
      setLibraryUrl("");
      setPixels(null);
      setInfo("");
      onSceneView(id);
    } catch (e) {
      setError((e as Error).message);
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
        <summary>Nouvelle scène (importer une battle map)</summary>
        <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <label>
          Battle map : image, ou fichier Dungeondraft / Dungeon Alchemist (.dd2vtt, .uvtt)
          <input type="file" accept="image/*,.dd2vtt,.uvtt,.df2vtt" onChange={(e) => pickFile(e.target.files?.[0])} />
        </label>
        {maps.length > 0 && (
          <label>
            ou une carte de la bibliothèque
            <select value={libraryUrl} onChange={(e) => pickLibrary(e.target.value)}>
              <option value="">—</option>
              {maps.map((m) => <option key={m.id} value={m.url}>{m.name}</option>)}
            </select>
          </label>
        )}
        {pixels && (
          <label>
            Pixels par case (souvent 70, 100, 140 ou 256 : regarde la description de la carte)
            <input
              type="number"
              min={10}
              value={perCell}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPerCell(v);
                applyGrid(pixels, v);
              }}
            />
          </label>
        )}
        <div className="row">
          <label>Largeur (cases)<input type="number" min={1} max={200} value={width} onChange={(e) => setWidth(Number(e.target.value))} /></label>
          <label>Hauteur (cases)<input type="number" min={1} max={200} value={height} onChange={(e) => setHeight(Number(e.target.value))} /></label>
        </div>
        {info && <small className="muted">{info}</small>}
        {error && <p className="error">{error}</p>}
        <button onClick={create} disabled={!name.trim() || busy}>{busy ? "Import…" : "Créer la scène"}</button>
      </details>
    </div>
  );
}

function NewTokenSection({ view, sceneId }: { view: CampaignView; sceneId: string }) {
  const [sheetId, setSheetId] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#c0392b");
  const [hidden, setHidden] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const add = async () => {
    const sheet = view.sheets.find((s) => s.id === sheetId);
    await api.post(`/campaigns/${view.campaign.id}/tokens`, {
      sceneId,
      name: name.trim() || sheet?.name || "Jeton",
      color,
      hidden,
      imageUrl,
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
        <TokenImagePicker view={view} value={imageUrl} onChange={setImageUrl} />
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
      <TokenImagePicker view={view} value={token.imageUrl} onChange={(imageUrl) => patch({ imageUrl })} />
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
      <small className="muted">
        {campaign.mode === "ai_gm"
          ? "L'IA mène la partie et répond aux joueurs. Tape /ia dans le chat pour lui donner une consigne privée."
          : campaign.mode === "ai_assistant"
            ? "Tape /ia dans le chat pour demander un conseil privé à l'IA."
            : "Pas d'IA à la table (/ia reste disponible pour toi)."}
      </small>
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
