import type { User } from "@mj-ia/shared";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import { CampaignsPage, JoinPage, LoginPage } from "./pages/HomePages";
import { TablePage } from "./pages/TablePage";
import "./styles.css";

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return hash.replace(/^#/, "") || "/";
}

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const path = useHash();

  useEffect(() => {
    api.get<User>("/me").then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <div className="center">Chargement…</div>;
  // Après connexion, on revient au lien demandé (ex. une invitation).
  if (!user) return <LoginPage onLogin={setUser} />;

  const join = path.match(/^\/join\/(.+)$/);
  if (join) return <JoinPage code={decodeURIComponent(join[1])} />;
  const table = path.match(/^\/c\/([\w-]+)$/);
  if (table) return <TablePage key={table[1]} campaignId={table[1]} />;

  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
  };
  return <CampaignsPage user={user} onLogout={logout} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
