import type { CampaignView, ClientToServerEvents, ServerToClientEvents, Token } from "@mj-ia/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { api } from "./api";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Charge la vue filtrée d'une campagne et la tient à jour en temps réel.
 * Le serveur n'envoie que ce que ce membre a le droit de voir.
 */
export function useCampaign(campaignId: string) {
  const [view, setView] = useState<CampaignView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<ClientSocket | null>(null);

  const reload = useCallback(async () => {
    try {
      setView(await api.get<CampaignView>(`/campaigns/${campaignId}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [campaignId]);

  useEffect(() => {
    reload();
    const socket: ClientSocket = io({ path: "/socket.io", withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("campaign:join", campaignId, (ok) => {
        if (!ok) setError("Accès refusé à cette campagne");
        else reload(); // rattrape ce qui a pu changer pendant une déconnexion
      });
    });
    socket.on("campaign:changed", reload);
    socket.on("token:upsert", (token: Token) =>
      setView((v) => v && { ...v, tokens: [...v.tokens.filter((t) => t.id !== token.id), token] }),
    );
    socket.on("token:remove", (id) => setView((v) => v && { ...v, tokens: v.tokens.filter((t) => t.id !== id) }));
    socket.on("error", (message) => console.warn(message));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [campaignId, reload]);

  const moveToken = useCallback((tokenId: string, x: number, y: number) => {
    // Mise à jour immédiate à l'écran, le serveur confirme ou corrige.
    setView((v) => v && { ...v, tokens: v.tokens.map((t) => (t.id === tokenId ? { ...t, x, y } : t)) });
    socketRef.current?.emit("token:move", { tokenId, x, y });
  }, []);

  return { view, error, reload, moveToken };
}
