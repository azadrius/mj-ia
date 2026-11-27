import type { CampaignView, ChatMessage, MessageAudio, ClientToServerEvents, ServerToClientEvents, Token } from "@mj-ia/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { api } from "./api";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Charge la vue filtrée d'une campagne et la tient à jour en temps réel.
 * Le serveur n'envoie que ce que ce membre a le droit de voir.
 */
export function useCampaign(campaignId: string, onAudio?: (audio: MessageAudio) => void) {
  const [view, setView] = useState<CampaignView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const socketRef = useRef<ClientSocket | null>(null);
  const onAudioRef = useRef(onAudio);
  onAudioRef.current = onAudio;

  const reload = useCallback(async () => {
    try {
      setView(await api.get<CampaignView>(`/campaigns/${campaignId}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [campaignId]);

  // Historique du chat, fusionné avec les messages reçus en direct pendant le chargement.
  const loadChat = useCallback(async () => {
    const history = await api.get<ChatMessage[]>(`/campaigns/${campaignId}/chat`).catch(() => []);
    setMessages((live) => mergeMessages(history, live));
  }, [campaignId]);

  useEffect(() => {
    reload();
    const socket: ClientSocket = io({ path: "/socket.io", withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("campaign:join", campaignId, (ok) => {
        if (!ok) setError("Accès refusé à cette campagne");
        else {
          // Rattrape ce qui a pu changer pendant une déconnexion.
          reload();
          loadChat();
        }
      });
    });
    socket.on("campaign:changed", reload);
    socket.on("token:upsert", (token: Token) =>
      setView((v) => v && { ...v, tokens: [...v.tokens.filter((t) => t.id !== token.id), token] }),
    );
    socket.on("token:remove", (id) => setView((v) => v && { ...v, tokens: v.tokens.filter((t) => t.id !== id) }));
    socket.on("chat:message", (m) => {
      setMessages((list) => mergeMessages(list, [m]));
      if (m.audio) onAudioRef.current?.(m.audio);
    });
    socket.on("ai:busy", setAiBusy);
    socket.on("error", (message) => {
      setNotice(message);
      setTimeout(() => setNotice(null), 5000);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [campaignId, reload, loadChat]);

  const moveToken = useCallback((tokenId: string, x: number, y: number) => {
    // Mise à jour immédiate à l'écran, le serveur confirme ou corrige.
    setView((v) => v && { ...v, tokens: v.tokens.map((t) => (t.id === tokenId ? { ...t, x, y } : t)) });
    socketRef.current?.emit("token:move", { tokenId, x, y });
  }, []);

  const sendChat = useCallback((text: string) => socketRef.current?.emit("chat:send", text), []);

  return { view, error, reload, moveToken, messages, sendChat, aiBusy, notice };
}

function mergeMessages(a: ChatMessage[], b: ChatMessage[]) {
  const byId = new Map<string, ChatMessage>();
  for (const m of [...a, ...b]) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt)).slice(-200);
}
