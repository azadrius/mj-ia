import { SYSTEMS, type CampaignMode, type Role, type User } from "@mj-ia/shared";
import { useEffect, useState } from "react";
import { api } from "../api";

export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [config, setConfig] = useState<{ discord: boolean; devLogin: boolean } | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<{ discord: boolean; devLogin: boolean }>("/auth/config").then(setConfig);
  }, []);

  const devLogin = async () => {
    try {
      onLogin(await api.post<User>("/auth/dev", { name }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="center card">
      <h1>MJ IA</h1>
      <p className="muted">La table de jeu de rôle avec un MJ qui ne dort jamais.</p>
      {config?.discord && (
        <a className="button discord" href="/api/auth/discord">Se connecter avec Discord</a>
      )}
      {config?.devLogin && (
        <form onSubmit={(e) => { e.preventDefault(); devLogin(); }}>
          <p className="muted">Connexion de test (sans Discord)</p>
          <input placeholder="Ton pseudo" value={name} onChange={(e) => setName(e.target.value)} />
          <button disabled={!name.trim()}>Entrer</button>
        </form>
      )}
      {config && !config.discord && !config.devLogin && <p>Aucune méthode de connexion configurée.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

interface CampaignSummary {
  id: string;
  name: string;
  system: string;
  mode: CampaignMode;
  role: Role;
}

export function CampaignsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [list, setList] = useState<CampaignSummary[] | null>(null);
  const [name, setName] = useState("");
  const [system, setSystem] = useState("dnd5e");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<CampaignSummary[]>("/campaigns").then(setList);
  }, []);

  const go = (id: string) => (location.hash = `#/c/${id}`);
  const create = async () => go((await api.post<{ id: string }>("/campaigns", { name, system })).id);
  const join = async () => {
    try {
      go((await api.post<{ id: string }>("/campaigns/join", { code: code.trim() })).id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="center card wide">
      <div className="panel-head">
        <h1>Mes campagnes</h1>
        <span>{user.name} · <button className="link" onClick={onLogout}>Déconnexion</button></span>
      </div>
      {list?.length === 0 && <p className="muted">Aucune campagne pour l'instant.</p>}
      <ul className="list">
        {list?.map((c) => (
          <li key={c.id}>
            <a href={`#/c/${c.id}`}>{c.name}</a>
            <small className="muted">{SYSTEMS[c.system]?.name ?? c.system} · {c.role === "gm" ? "MJ" : c.role === "player" ? "Joueur" : "Spectateur"}</small>
          </li>
        ))}
      </ul>
      <div className="row">
        <form onSubmit={(e) => { e.preventDefault(); create(); }}>
          <h3>Nouvelle campagne</h3>
          <input placeholder="Nom de la campagne" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={system} onChange={(e) => setSystem(e.target.value)}>
            {Object.values(SYSTEMS).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button disabled={!name.trim()}>Créer (je suis MJ)</button>
        </form>
        <form onSubmit={(e) => { e.preventDefault(); join(); }}>
          <h3>Rejoindre</h3>
          <input placeholder="Code d'invitation" value={code} onChange={(e) => setCode(e.target.value)} />
          <button disabled={!code.trim()}>Rejoindre</button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}

/** Ouverture d'un lien d'invitation #/join/CODE. */
export function JoinPage({ code }: { code: string }) {
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .post<{ id: string }>("/campaigns/join", { code })
      .then(({ id }) => (location.hash = `#/c/${id}`))
      .catch((e) => setError((e as Error).message));
  }, [code]);
  return <div className="center">{error ? <><p>{error}</p><a href="#/">← Accueil</a></> : "Connexion à la campagne…"}</div>;
}
