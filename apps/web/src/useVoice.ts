import type { MessageAudio } from "@mj-ia/shared";
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "mjia-voice-on";

function readPref() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Lit les répliques à voix haute, une à la fois, dans l'ordre d'arrivée.
 * Le navigateur exige un clic avant de jouer du son : d'où le bouton « Voix ».
 */
export function useVoice() {
  const [enabled, setEnabled] = useState(readPref);
  const ctxRef = useRef<AudioContext | null>(null);
  const queue = useRef<MessageAudio[]>([]);
  const playing = useRef<AudioBufferSourceNode | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const playNext = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx || playing.current) return;
    const next = queue.current.shift();
    if (!next) return;
    try {
      const data = await (await fetch(next.url)).arrayBuffer();
      const buffer = await ctx.decodeAudioData(data);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.detune.value = next.pitchCents;
      const gain = ctx.createGain();
      gain.gain.value = next.volume;
      source.connect(gain).connect(ctx.destination);
      playing.current = source;
      source.onended = () => {
        playing.current = null;
        void playNext();
      };
      source.start();
    } catch (e) {
      console.warn("Lecture impossible", e);
      playing.current = null;
      void playNext();
    }
  }, []);

  const enqueue = useCallback(
    (audio: MessageAudio) => {
      if (!enabledRef.current) return;
      queue.current.push(audio);
      void playNext();
    },
    [playNext],
  );

  const toggle = useCallback(() => {
    setEnabled((on) => {
      const next = !on;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* navigation privée : on ne retient pas le choix */
      }
      if (next) {
        ctxRef.current ??= new AudioContext();
        void ctxRef.current.resume();
      } else {
        queue.current = [];
        playing.current?.stop();
        playing.current = null;
      }
      return next;
    });
  }, []);

  // Choix retenu d'une visite précédente : le son démarrera au premier clic dans la page.
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      ctxRef.current ??= new AudioContext();
      void ctxRef.current.resume();
    };
    addEventListener("pointerdown", unlock, { once: true });
    return () => removeEventListener("pointerdown", unlock);
  }, [enabled]);

  return { enabled, toggle, enqueue };
}
