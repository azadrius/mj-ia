import { canManageAsset, isGm, type Asset, type AssetKind, type CampaignView } from "@mj-ia/shared";
import { useState } from "react";
import { api } from "../api";
import { VisibilityPicker } from "./VisibilityPicker";

const SECTIONS: { kind: AssetKind; title: string; accept: string; hint: string }[] = [
  {
    kind: "document",
    title: "Documents",
    accept: ".pdf,.txt,.md,image/*",
    hint: "Livre de règles, aides de jeu, lettres, cartes du monde… (PDF, image, .txt, .md, 150 Mo max). Choisis qui peut les lire.",
  },
  {
    kind: "token",
    title: "Images de jetons",
    accept: "image/*",
    hint: "Portraits et pions (PNG transparent idéal). Plusieurs fichiers à la fois possibles.",
  },
  {
    kind: "map",
    title: "Battle maps",
    accept: "image/*",
    hint: "Images de cartes. Pour créer une scène (et importer un fichier Dungeondraft .dd2vtt), va dans l'onglet MJ > Scènes.",
  },
];

const formatSize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;

/** Bibliothèque de la campagne : documents pour les joueurs, images de jetons, battle maps. */
export function LibraryPanel({ view }: { view: CampaignView }) {
  const gm = isGm(view.me);
  const player = view.me.role === "player";
  const sections = SECTIONS.filter((s) => gm || s.kind === "document" || (s.kind === "token" && player));
  return (
    <>
      {sections.map((s) => (
        <Section key={s.kind} view={view} {...s} canUpload={gm || (player && s.kind === "token")} />
      ))}
    </>
  );
}

function Section({ view, kind, title, accept, hint, canUpload }: {
  view: CampaignView;
  kind: AssetKind;
  title: string;
  accept: string;
  hint: string;
  canUpload: boolean;
}) {
  const gm = isGm(view.me);
  const items = view.assets.filter((a) => a.kind === kind);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    try {
      for (const [i, file] of [...files].entries()) {
        setBusy(`Envoi ${i + 1}/${files.length}…`);
        await api.uploadAsset(view.campaign.id, kind, file);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        {canUpload && (
          <label className="button small upload">
            {busy || "+ Importer"}
            <input type="file" multiple accept={accept} hidden disabled={!!busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {canUpload && <small className="muted">{hint}</small>}
      {error && <p className="error">{error}</p>}
      {items.length === 0 && <p className="muted">{kind === "document" && !gm ? "Le MJ n'a encore rien partagé." : "Rien pour l'instant."}</p>}
      {kind === "document" ? (
        <ul className="list">
          {items.map((a) => <DocumentRow key={a.id} view={view} asset={a} />)}
        </ul>
      ) : (
        <div className="asset-grid">
          {items.map((a) => <ImageTile key={a.id} view={view} asset={a} />)}
        </div>
      )}
    </div>
  );
}

function DocumentRow({ view, asset }: { view: CampaignView; asset: Asset }) {
  const gm = isGm(view.me);
  const [open, setOpen] = useState(false);
  return (
    <li className="asset-row">
      <div className="panel-head">
        <a href={asset.url} target="_blank" rel="noreferrer">📄 {asset.name}</a>
        <small className="muted">
          {formatSize(asset.size)}
          {gm && (asset.visibility === "gm" ? " · privé" : asset.visibility === "all" ? " · tous" : " · certains")}
        </small>
        {gm && <button className="small" onClick={() => setOpen(!open)}>{open ? "Fermer" : "Gérer"}</button>}
      </div>
      {open && <AssetSettings view={view} asset={asset} />}
    </li>
  );
}

function ImageTile({ view, asset }: { view: CampaignView; asset: Asset }) {
  const gm = isGm(view.me);
  const [open, setOpen] = useState(false);
  // Jetons du joueur sur la scène active, pour lui appliquer cette image.
  const mine = asset.kind === "token" && !gm ? view.tokens.filter((t) => t.controlledBy.includes(view.me.userId)) : [];
  return (
    <div className="asset-tile">
      <img src={asset.url} alt={asset.name} loading="lazy" />
      <small title={asset.name}>{asset.name}</small>
      {mine.map((t) => (
        <button
          key={t.id}
          className="small"
          onClick={() => api.patch(`/campaigns/${view.campaign.id}/tokens/${t.id}/image`, { assetId: asset.id })}
        >
          Mettre sur {t.name}
        </button>
      ))}
      {canManageAsset(asset, view.me) && (
        <button className="small" onClick={() => setOpen(!open)}>{open ? "Fermer" : "Gérer"}</button>
      )}
      {open && <AssetSettings view={view} asset={asset} />}
    </div>
  );
}

function AssetSettings({ view, asset }: { view: CampaignView; asset: Asset }) {
  const gm = isGm(view.me);
  const base = `/campaigns/${view.campaign.id}/assets/${asset.id}`;
  const [name, setName] = useState(asset.name);
  return (
    <div className="asset-settings">
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== asset.name && api.patch(base, { name })} />
      {gm && (
        <VisibilityPicker
          members={view.members}
          visibility={asset.visibility}
          visibleTo={asset.visibleTo}
          onChange={(visibility, visibleTo) => api.patch(base, { visibility, visibleTo })}
        />
      )}
      <button className="danger" onClick={() => confirm(`Supprimer ${asset.name} ?`) && api.del(base)}>Supprimer</button>
    </div>
  );
}

/** Choix d'une image de jeton dans la bibliothèque (avec envoi d'une nouvelle image). */
export function TokenImagePicker({ view, value, onChange }: {
  view: CampaignView;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const images = view.assets.filter((a) => a.kind === "token");
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange((await api.uploadAsset(view.campaign.id, "token", file)).url);
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset className="token-picker">
      <legend>Image</legend>
      <div className="asset-grid small">
        <button type="button" className={`asset-choice${value === null ? " on" : ""}`} onClick={() => onChange(null)} title="Pastille de couleur">
          <span className="dot" />
        </button>
        {images.map((a) => (
          <button type="button" key={a.id} className={`asset-choice${value === a.url ? " on" : ""}`} onClick={() => onChange(a.url)} title={a.name}>
            <img src={a.url} alt={a.name} loading="lazy" />
          </button>
        ))}
        <label className="asset-choice add" title="Importer une image">
          {busy ? "…" : "+"}
          <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      </div>
    </fieldset>
  );
}
