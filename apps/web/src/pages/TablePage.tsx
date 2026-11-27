import { isGm, type Token } from "@mj-ia/shared";
import { useState } from "react";
import { ChatPanel } from "../components/ChatPanel";
import { GmPanel } from "../components/GmPanel";
import { JournalPanel } from "../components/JournalPanel";
import { MapCanvas } from "../components/MapCanvas";
import { SheetsPanel } from "../components/SheetsPanel";
import { useCampaign } from "../useCampaign";

type Tab = "chat" | "gm" | "sheets" | "journal";

export function TablePage({ campaignId }: { campaignId: string }) {
  const { view, error, moveToken, messages, sendChat, aiBusy, notice } = useCampaign(campaignId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);
  const [gmSceneId, setGmSceneId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");

  const gm = view ? isGm(view.me) : false;

  if (error) return <div className="center"><p>{error}</p><a href="#/">← Mes campagnes</a></div>;
  if (!view) return <div className="center">Chargement…</div>;

  // Le MJ peut regarder n'importe quelle scène ; les joueurs voient la scène active.
  const sceneId = (gm && gmSceneId && view.scenes.some((s) => s.id === gmSceneId) ? gmSceneId : null) ?? view.campaign.activeSceneId;
  const scene = view.scenes.find((s) => s.id === sceneId);
  const tokens = view.tokens.filter((t) => t.sceneId === sceneId);
  const selected = view.tokens.find((t) => t.id === selectedId) ?? null;

  const handleSelect = (token: Token | null) => {
    setSelectedId(token?.id ?? null);
    if (!token) return;
    if (gm) setTab("gm");
    else if (token.sheetId) {
      setOpenSheetId(token.sheetId);
      setTab("sheets");
    }
  };

  return (
    <div className="table">
      <header>
        <a href="#/">← Campagnes</a>
        <strong>{view.campaign.name}</strong>
        <span className="muted">{scene ? scene.name : ""}{gm && sceneId !== view.campaign.activeSceneId ? " (aperçu MJ)" : ""}</span>
        <span className="spacer" />
        <span>{view.me.name} · {gm ? "MJ" : view.me.role === "player" ? "Joueur" : "Spectateur"}</span>
      </header>
      <main>
        {scene ? (
          <MapCanvas
            key={scene.id}
            scene={scene}
            tokens={tokens}
            me={view.me}
            selectedId={selectedId}
            onSelect={handleSelect}
            onMove={moveToken}
          />
        ) : (
          <div className="map empty">
            {gm ? "Crée une première scène dans le panneau MJ." : "Le MJ n'a pas encore ouvert de scène."}
          </div>
        )}
        <aside>
          <nav className="tabs">
            <button className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>Chat</button>
            {gm && <button className={tab === "gm" ? "on" : ""} onClick={() => setTab("gm")}>MJ</button>}
            <button className={tab === "sheets" ? "on" : ""} onClick={() => setTab("sheets")}>Fiches</button>
            <button className={tab === "journal" ? "on" : ""} onClick={() => setTab("journal")}>Journal</button>
          </nav>
          {notice && <div className="notice">{notice}</div>}
          {tab === "chat" && <ChatPanel view={view} messages={messages} aiBusy={aiBusy} onSend={sendChat} />}
          <div className="aside-body" hidden={tab === "chat"}>
            {tab === "gm" && gm && (
              <GmPanel view={view} selected={selected} sceneId={sceneId} onSceneView={setGmSceneId} />
            )}
            {tab === "sheets" && <SheetsPanel view={view} openSheetId={openSheetId} onOpen={setOpenSheetId} />}
            {tab === "journal" && <JournalPanel view={view} />}
          </div>
        </aside>
      </main>
    </div>
  );
}
