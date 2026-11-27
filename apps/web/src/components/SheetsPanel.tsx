import {
  ABILITIES,
  ABILITY_LABELS,
  abilityModifier,
  canEditSheet,
  dnd5eSheetSchema,
  isGm,
  type CampaignView,
  type Dnd5eSheet,
  type Sheet,
} from "@mj-ia/shared";
import { useEffect, useState } from "react";
import { api } from "../api";
import { VisibilityPicker } from "./VisibilityPicker";

interface Props {
  view: CampaignView;
  openSheetId: string | null;
  onOpen: (id: string | null) => void;
}

export function SheetsPanel({ view, openSheetId, onOpen }: Props) {
  const { me, campaign } = view;
  const open = view.sheets.find((s) => s.id === openSheetId);
  const mine = view.sheets.filter((s) => s.ownerId === me.userId);

  const create = async () => {
    const name = prompt("Nom du personnage ?");
    if (!name) return;
    const { id } = await api.post<{ id: string }>(`/campaigns/${campaign.id}/sheets`, {
      name,
      ownerId: isGm(me) ? null : me.userId,
      data: { kind: isGm(me) ? "npc" : "pc" },
    });
    onOpen(id);
  };

  if (open) return <SheetEditor view={view} sheet={open} onClose={() => onOpen(null)} />;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Fiches</h3>
        {me.role !== "spectator" && (isGm(me) || mine.length === 0) && (
          <button onClick={create}>{isGm(me) ? "+ Fiche" : "Créer mon personnage"}</button>
        )}
      </div>
      {view.sheets.length === 0 && <p className="muted">Aucune fiche visible.</p>}
      <ul className="list">
        {view.sheets.map((s) => (
          <li key={s.id}>
            <button className="link" onClick={() => onOpen(s.id)}>
              {s.name}
            </button>
            <small className="muted">
              {s.ownerId ? view.members.find((m) => m.userId === s.ownerId)?.name ?? "" : "PNJ"}
              {isGm(me) && s.visibility === "gm" && " · privé"}
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SheetEditor({ view, sheet, onClose }: { view: CampaignView; sheet: Sheet; onClose: () => void }) {
  const { me, campaign, members } = view;
  const editable = canEditSheet(sheet, me);
  const gm = isGm(me);
  const [name, setName] = useState(sheet.name);
  const [data, setData] = useState<Dnd5eSheet>(() => dnd5eSheetSchema.parse(sheet.data));
  const [ownerId, setOwnerId] = useState(sheet.ownerId);
  const [visibility, setVisibility] = useState(sheet.visibility);
  const [visibleTo, setVisibleTo] = useState(sheet.visibleTo);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setName(sheet.name);
    setData(dnd5eSheetSchema.parse(sheet.data));
    // On ne réinitialise que si la fiche a vraiment changé côté serveur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.id, sheet.name, JSON.stringify(sheet.data)]);

  const save = async () => {
    try {
      const body = gm ? { name, data, ownerId, visibility, visibleTo } : { name, data };
      await api.patch(`/campaigns/${campaign.id}/sheets/${sheet.id}`, body);
      setStatus("Enregistré");
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const remove = async () => {
    if (!confirm(`Supprimer la fiche ${sheet.name} ?`)) return;
    await api.del(`/campaigns/${campaign.id}/sheets/${sheet.id}`);
    onClose();
  };

  const num = (v: string) => (v === "" ? 0 : Number(v));
  const set = (patch: Partial<Dnd5eSheet>) => setData((d) => ({ ...d, ...patch }));

  return (
    <div className="panel sheet">
      <div className="panel-head">
        <button className="link" onClick={onClose}>
          ← Fiches
        </button>
        {gm && <button className="danger" onClick={remove}>Supprimer</button>}
      </div>
      <fieldset disabled={!editable}>
        <input className="title" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="row">
          <label>Race<input value={data.race} onChange={(e) => set({ race: e.target.value })} /></label>
          <label>Classe<input value={data.class} onChange={(e) => set({ class: e.target.value })} /></label>
          <label>Niveau<input type="number" value={data.level} onChange={(e) => set({ level: num(e.target.value) })} /></label>
        </div>
        <div className="row">
          <label>CA<input type="number" value={data.ac} onChange={(e) => set({ ac: num(e.target.value) })} /></label>
          <label>PV<input type="number" value={data.hp.current} onChange={(e) => set({ hp: { ...data.hp, current: num(e.target.value) } })} /></label>
          <label>PV max<input type="number" value={data.hp.max} onChange={(e) => set({ hp: { ...data.hp, max: num(e.target.value) } })} /></label>
          <label>Vitesse<input type="number" value={data.speed} onChange={(e) => set({ speed: num(e.target.value) })} /></label>
        </div>
        <div className="abilities">
          {ABILITIES.map((a) => (
            <label key={a}>
              {ABILITY_LABELS[a]}
              <input
                type="number"
                min={1}
                max={30}
                value={data.abilities[a]}
                onChange={(e) => set({ abilities: { ...data.abilities, [a]: num(e.target.value) } })}
              />
              <span>{formatMod(abilityModifier(data.abilities[a]))}</span>
            </label>
          ))}
        </div>
        <label>
          Notes
          <textarea rows={5} value={data.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
      </fieldset>

      {gm && (
        <>
          <label>
            Joueur propriétaire
            <select value={ownerId ?? ""} onChange={(e) => setOwnerId(e.target.value || null)}>
              <option value="">Aucun (PNJ / monstre)</option>
              {members
                .filter((m) => m.role === "player")
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <VisibilityPicker
            members={members}
            visibility={visibility}
            visibleTo={visibleTo}
            onChange={(v, to) => {
              setVisibility(v);
              setVisibleTo(to);
            }}
          />
          <small className="muted">Le joueur propriétaire voit toujours sa fiche.</small>
        </>
      )}
      {editable && (
        <div className="panel-head">
          <button onClick={save}>Enregistrer</button>
          <small className="muted">{status}</small>
        </div>
      )}
    </div>
  );
}

const formatMod = (m: number) => (m >= 0 ? `+${m}` : `${m}`);
