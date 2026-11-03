import type { Ref } from "react";
import { formatUpdated, withoutTitleHeading, type PageView } from "@/lib/pages-client";
import PageBody from "./PageBody";
import styles from "./Workspace.module.css";

type Props = {
  page: PageView;
  onClose: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
};

export default function PagePane({ page, onClose, headingRef }: Props) {
  return (
    <article className={styles.pane} aria-labelledby="page-pane-title">
      <header className={styles.paneHead}>
        {/* Focusable by script so opening a page can move focus here. */}
        <h2 id="page-pane-title" ref={headingRef} tabIndex={-1} className={styles.paneTitle}>
          {page.title}
        </h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close page">
          <span aria-hidden="true">&times;</span>
        </button>
      </header>

      <div className={styles.paneBody}>
        <div className={styles.prose}>
          <PageBody body={withoutTitleHeading(page.body, page.title)} />
        </div>
      </div>

      <footer className={styles.paneFoot}>
        <time dateTime={page.updatedAt}>Updated {formatUpdated(page.updatedAt)}</time>
      </footer>
    </article>
  );
}
