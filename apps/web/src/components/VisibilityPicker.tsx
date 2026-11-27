import type { Member, Visibility } from "@mj-ia/shared";

interface Props {
  members: Member[];
  visibility: Visibility;
  visibleTo: string[];
  onChange: (visibility: Visibility, visibleTo: string[]) => void;
}

/** Choix de qui voit un élément : MJ seul, tout le monde, ou certains joueurs. */
export function VisibilityPicker({ members, visibility, visibleTo, onChange }: Props) {
  const players = members.filter((m) => m.role !== "gm");
  return (
    <fieldset className="visibility">
      <legend>Visible par</legend>
      <select value={visibility} onChange={(e) => onChange(e.target.value as Visibility, visibleTo)}>
        <option value="gm">MJ seulement</option>
        <option value="all">Tous les joueurs</option>
        <option value="some">Certains joueurs</option>
      </select>
      {visibility === "some" && (
        <div className="checks">
          {players.length === 0 && <small>Aucun joueur pour l'instant.</small>}
          {players.map((p) => (
            <label key={p.userId}>
              <input
                type="checkbox"
                checked={visibleTo.includes(p.userId)}
                onChange={(e) =>
                  onChange(
                    visibility,
                    e.target.checked ? [...visibleTo, p.userId] : visibleTo.filter((id) => id !== p.userId),
                  )
                }
              />
              {p.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
