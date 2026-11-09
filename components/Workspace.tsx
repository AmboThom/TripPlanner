"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/chat-client";
import type { PageView } from "@/lib/pages-client";
import Chat from "./Chat";
import PageList from "./PageList";
import PagePane from "./PagePane";
import styles from "./Workspace.module.css";

type Props = { initialMessages: ChatMessage[]; pages: PageView[] };

/**
 * Page list on the left, the chosen page in the middle, chat on the right. The chat is
 * rendered in the same place whether or not a page is open, so opening, switching and
 * closing pages never remounts it: a draft, the scroll position and an in-flight reply
 * all survive.
 */
export default function Workspace({ initialMessages, pages }: Props) {
  const router = useRouter();
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const selected = pages.find((page) => page.title === selectedTitle) ?? null;

  const headingRef = useRef<HTMLHeadingElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // The page whose pane was just closed, so focus can go back to its button.
  const returnFocusTo = useRef<string | null>(null);

  useEffect(() => {
    if (selectedTitle !== null) {
      // Opening, or switching to, a page moves focus to its heading, so a keyboard or
      // screen reader user lands on what they just chose instead of staying in the list.
      headingRef.current?.focus();
    } else if (returnFocusTo.current !== null) {
      buttons.current.get(returnFocusTo.current)?.focus();
      returnFocusTo.current = null;
    }
  }, [selectedTitle]);

  function close() {
    returnFocusTo.current = selected?.title ?? null;
    setSelectedTitle(null);
  }

  return (
    <div className={`${styles.shell} ${selected ? styles.open : ""}`}>
      <PageList
        pages={pages}
        selectedTitle={selected?.title ?? null}
        onSelect={setSelectedTitle}
        onButtonRef={(title, element) => {
          if (element) buttons.current.set(title, element);
          else buttons.current.delete(title);
        }}
      />

      <div className={styles.paneSlot}>
        {selected && <PagePane page={selected} onClose={close} headingRef={headingRef} />}
      </div>

      <div className={styles.chatSlot}>
        {/* A finished turn may have filed or rewritten pages. Refreshing re-runs the
            server page for fresh props and keeps client state, so the chat and the open
            page are not remounted. */}
        <Chat initialMessages={initialMessages} onTurnEnd={() => router.refresh()} />
      </div>
    </div>
  );
}
