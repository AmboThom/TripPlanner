"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  NETWORK_FAILURE,
  failureMessage,
  readReply,
  type ChatMessage,
} from "@/lib/chat-client";
import styles from "./Chat.module.css";

const INVITATION =
  "Tell me about your trip. Where you're going, what you've booked, what you're thinking about.";

// autocomplete on a button is non-standard, so React's types do not list it, but Firefox
// reads it. Spread rather than written inline so the typing is not bypassed on the element.
const NO_STATE_RESTORE = { autoComplete: "off" };

/** Drops the placeholder reply bubble if the turn produced no text at all. */
function withoutEmptyReply(messages: ChatMessage[]): ChatMessage[] {
  const last = messages[messages.length - 1];
  return last && last.role === "assistant" && last.content === "" ? messages.slice(0, -1) : messages;
}

type Props = {
  initialMessages: ChatMessage[];
  /** Called once when a turn is over, whatever its outcome, unless the chat was left mid-turn. */
  onTurnEnd?: () => void;
};

export default function Chat({ initialMessages, onTurnEnd }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // True from send until the first piece of the reply arrives.
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef<AbortController | null>(null);

  // Closing the page aborts the request. The route forwards the abort to the
  // model, so this also stops a billed loop nobody is reading.
  useEffect(() => () => inFlight.current?.abort(), []);

  // Keep the newest text in view while a reply streams, and on first load.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, waiting]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;

    setError(null);
    setDraft("");
    setSending(true);
    setWaiting(true);
    setMessages((current) => [
      ...current,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);

    const controller = new AbortController();
    inFlight.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        // The route answers 415 to anything else: it is what makes a cross-site
        // page unable to drive it.
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        setError(await failureMessage(response));
        return;
      }

      await readReply(response, (piece) => {
        setWaiting(false);
        setMessages((current) => {
          const last = current[current.length - 1];
          return [...current.slice(0, -1), { ...last, content: last.content + piece }];
        });
      });
    } catch {
      if (!controller.signal.aborted) setError(NETWORK_FAILURE);
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (!controller.signal.aborted) {
        setMessages(withoutEmptyReply);
        setWaiting(false);
        setSending(false);
        inputRef.current?.focus();
        onTurnEnd?.();
      }
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter during IME composition confirms a character; it is not a send.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  const lastIndex = messages.length - 1;

  return (
    <section className={styles.chat} aria-label="Trip chat">
      {/* Always rendered, so assistive tech has a live region to announce into. */}
      <div ref={logRef} className={styles.log} role="log" aria-live="polite" aria-busy={sending} aria-label="Messages">
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <p>{INVITATION}</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`${styles.turn} ${message.role === "user" ? styles.turnUser : ""}`}
            >
              <span className={styles.who}>{message.role === "user" ? "You" : "Bot"}</span>
              <div
                className={`${styles.bubble} ${
                  message.role === "user" ? styles.bubbleUser : styles.bubbleAssistant
                }`}
              >
                {waiting && index === lastIndex && message.content === "" ? (
                  <>
                    <span className={styles.dots} aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className={styles.visuallyHidden}>Waiting for a reply</span>
                  </>
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {error && (
        <div role="alert" className={styles.alert}>
          {error}
        </div>
      )}

      {/*
        autoComplete="off" on the form and on the button. Firefox, unlike other browsers,
        restores a button's dynamic disabled state after a reload. The server renders Send
        disabled; once the user has typed, Firefox puts back "enabled", and React then
        reports a hydration mismatch on this button. It also stops the browser refilling
        the textarea with a draft that the component's state does not know about.
      */}
      <form className={styles.composer} onSubmit={onSubmit} autoComplete="off">
        <div className={styles.field}>
          <label htmlFor="message" className={styles.visuallyHidden}>
            Message
          </label>
          <textarea
            id="message"
            ref={inputRef}
            className={styles.input}
            rows={1}
            value={draft}
            placeholder="Message the assistant"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            className={styles.send}
            {...NO_STATE_RESTORE}
            disabled={sending || !draft.trim()}
          >
            Send
          </button>
        </div>
      </form>
    </section>
  );
}
