import { isGm, type CampaignView, type ChatMessage } from "@mj-ia/shared";
import { useEffect, useRef, useState } from "react";

interface Props {
  view: CampaignView;
  messages: ChatMessage[];
  aiBusy: boolean;
  onSend: (text: string) => void;
}

const HELP = {
  player: "/r 1d20+3 jet · /w Nom texte chuchoter · /mj texte au MJ",
  gm: "/r 1d20+3 jet · /gr jet secret · /w Nom texte · /ia demande à l'IA",
};

export function ChatPanel({ view, messages, aiBusy, onSend }: Props) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const gm = isGm(view.me);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, aiBusy]);

  const send = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };

  const audience = (m: ChatMessage) => {
    if (m.visibility === "all") return null;
    if (m.visibility === "gm") return gm ? "privé MJ" : "au MJ";
    const names = m.visibleTo.map((id) => view.members.find((x) => x.userId === id)?.name ?? "?");
    return names.length ? `à ${names.join(", ")}` : "privé";
  };

  return (
    <div className="chat">
      <div className="messages" ref={listRef}>
        {messages.length === 0 && <p className="muted">La partie n'a pas encore commencé.</p>}
        {messages.map((m) => {
          const to = audience(m);
          return (
            <div key={m.id} className={`msg ${m.kind}${to ? " private" : ""}`}>
              <div className="msg-head">
                <strong>{m.speaker}</strong>
                {m.emotion && m.emotion !== "neutre" && <span className="emotion">{m.emotion}</span>}
                {to && <span className="to">{to}</span>}
              </div>
              {m.kind === "roll" && m.roll ? (
                <div>
                  <span className="total">{m.roll.total}</span> <span className="muted">{m.text}</span>
                </div>
              ) : (
                <div className="prose">{m.text}</div>
              )}
            </div>
          );
        })}
        {aiBusy && <div className="msg system muted">{view.campaign.mode === "ai_gm" ? "Le MJ IA réfléchit…" : "L'IA réfléchit…"}</div>}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          rows={2}
          value={text}
          placeholder={view.me.role === "spectator" ? "Les spectateurs peuvent chuchoter (/w)" : "Ton action ou ta réplique…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button disabled={!text.trim()}>Envoyer</button>
      </form>
      <small className="muted">{gm ? HELP.gm : HELP.player}</small>
    </div>
  );
}
