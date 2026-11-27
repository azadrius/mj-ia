import {
  canSeeMessage,
  describeRoll,
  isGm,
  messageForMember,
  parseChatCommand,
  rollDice,
  type ChatKind,
  type ChatMessage,
  type DiceRoll,
  type Emotion,
  type Member,
  type Visibility,
} from "@mj-ia/shared";
import { desc, eq } from "drizzle-orm";
import { requestAiTurn } from "./ai/gm";
import { db } from "./db/client";
import { loadCampaignData, loadMembers } from "./db/load";
import { chatMessages } from "./db/schema";
import { campaignSockets } from "./realtime";

type NewMessage = {
  authorId: string | null;
  speaker: string;
  kind: ChatKind;
  text: string;
  emotion?: Emotion | null;
  roll?: DiceRoll | null;
  visibility?: Visibility;
  visibleTo?: string[];
};

const toMessage = (row: typeof chatMessages.$inferSelect): ChatMessage => ({
  id: row.id,
  campaignId: row.campaignId,
  authorId: row.authorId,
  speaker: row.speaker,
  kind: row.kind,
  text: row.text,
  emotion: (row.emotion as Emotion | null) ?? null,
  roll: row.roll ?? null,
  visibility: row.visibility,
  visibleTo: row.visibleTo,
  createdAt: row.createdAt.toISOString(),
});

/** Enregistre un message et l'envoie aux membres connectés qui ont le droit de le voir. */
export async function postMessage(campaignId: string, input: NewMessage): Promise<ChatMessage> {
  const [row] = await db
    .insert(chatMessages)
    .values({
      campaignId,
      authorId: input.authorId,
      speaker: input.speaker,
      kind: input.kind,
      text: input.text,
      emotion: input.emotion ?? null,
      roll: input.roll ?? null,
      visibility: input.visibility ?? "all",
      visibleTo: input.visibleTo ?? [],
    })
    .returning();
  const message = toMessage(row);

  const sockets = await campaignSockets(campaignId);
  if (sockets.length) {
    const members = await loadMembers(campaignId);
    for (const socket of sockets) {
      const me = members.find((m) => m.userId === socket.data.userId);
      if (me && canSeeMessage(message, me)) socket.emit("chat:message", messageForMember(message, me));
    }
  }
  return message;
}

/** Derniers messages, du plus ancien au plus récent, sans filtre. */
export async function loadRecentMessages(campaignId: string, limit = 60): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.campaignId, campaignId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  return rows.reverse().map(toMessage);
}

export async function loadMessagesFor(campaignId: string, me: Member, limit = 100) {
  const all = await loadRecentMessages(campaignId, limit * 2);
  return all.filter((m) => canSeeMessage(m, me)).slice(-limit).map((m) => messageForMember(m, me));
}

/** Traite une ligne tapée par un membre dans le chat. */
export async function handleChatInput(campaignId: string, me: Member, input: string) {
  if (!input.trim()) return;
  if (input.length > 4000) throw new Error("Message trop long");
  const data = await loadCampaignData(campaignId);
  if (!data) return;
  const { mode } = data.campaign;
  const command = parseChatCommand(input, data.members);

  switch (command.type) {
    case "say":
      if (me.role === "spectator") throw new Error("Les spectateurs ne peuvent pas parler à la table");
      await postMessage(campaignId, { authorId: me.userId, speaker: me.name, kind: "chat", text: command.text });
      if (mode === "ai_gm") requestAiTurn(campaignId, { kind: "table" });
      return;

    case "roll": {
      if (me.role === "spectator") throw new Error("Les spectateurs ne lancent pas de dés");
      const roll = rollDice(command.formula);
      await postMessage(campaignId, {
        authorId: me.userId,
        speaker: me.name,
        kind: "roll",
        text: describeRoll(roll),
        roll,
        visibility: command.secret ? "gm" : "all",
      });
      if (mode === "ai_gm") requestAiTurn(campaignId, { kind: "table" });
      return;
    }

    case "whisper":
      await postMessage(campaignId, {
        authorId: me.userId,
        speaker: me.name,
        kind: "chat",
        text: command.text,
        visibility: "some",
        visibleTo: [command.to.userId],
      });
      return;

    case "to_gm":
      await postMessage(campaignId, {
        authorId: me.userId,
        speaker: me.name,
        kind: "chat",
        text: command.text,
        visibility: "gm",
      });
      // En mode MJ IA, c'est l'IA qui répond en privé.
      if (mode === "ai_gm") requestAiTurn(campaignId, { kind: "private_question", from: me });
      return;

    case "ai":
      if (isGm(me)) {
        await postMessage(campaignId, { authorId: me.userId, speaker: me.name, kind: "chat", text: `/ia ${command.text}`, visibility: "gm" });
        // MJ IA : consigne donnée à l'IA. Sinon : conseil privé au MJ.
        requestAiTurn(campaignId, mode === "ai_gm" ? { kind: "gm_direction", text: command.text } : { kind: "gm_advice", text: command.text });
      } else if (mode === "ai_gm") {
        await postMessage(campaignId, { authorId: me.userId, speaker: me.name, kind: "chat", text: command.text, visibility: "gm" });
        requestAiTurn(campaignId, { kind: "private_question", from: me });
      } else {
        throw new Error("L'IA n'est disponible pour les joueurs qu'en mode MJ IA");
      }
      return;
  }
}
