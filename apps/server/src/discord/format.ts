import type { ChatMessage } from "@mj-ia/shared";

/** Neutralise la mise en forme Discord et les mentions (@everyone…) dans un texte venu de la table. */
export function escapeDiscord(text: string) {
  return text.replace(/([\\*_~`|>])/g, "\\$1").replace(/@/g, "@\u200b");
}

/** Mise en forme d'un message de la table pour le salon Discord. */
export function formatForDiscord(m: ChatMessage): string {
  const text = escapeDiscord(m.text).slice(0, 1900);
  const who = escapeDiscord(m.speaker);
  switch (m.kind) {
    case "narration":
      return `📜 *${text}*`;
    case "npc":
      return `🎭 **${who}**${m.emotion && m.emotion !== "neutre" ? ` *(${m.emotion})*` : ""} : ${text}`;
    case "roll":
      return `🎲 **${who}** : ${m.roll ? `**${m.roll.total}**  ` : ""}${text}`;
    default:
      return `**${who}** : ${text}`;
  }
}
