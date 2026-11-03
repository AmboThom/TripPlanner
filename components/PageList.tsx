import type { PageView } from "@/lib/pages-client";
import styles from "./Workspace.module.css";

type Props = {
  pages: PageView[];
  selectedTitle: string | null;
  onSelect: (title: string) => void;
  /** Lets the owner return focus to a page's button after its pane closes. */
  onButtonRef?: (title: string, element: HTMLButtonElement | null) => void;
};

export default function PageList({ pages, selectedTitle, onSelect, onButtonRef }: Props) {
  return (
    <nav className={styles.rail} aria-label="Pages">
      <div className={styles.railHead}>
        <h2 className={styles.eyebrow}>Pages</h2>
        <span className={styles.count}>{pages.length}</span>
      </div>

      {pages.length === 0 ? (
        <p className={styles.none}>No pages yet. They appear as you talk.</p>
      ) : (
        <ul className={styles.list}>
          {pages.map((page) => (
            <li key={page.title}>
              <button
                type="button"
                ref={(element) => onButtonRef?.(page.title, element)}
                className={styles.pageButton}
                aria-current={page.title === selectedTitle ? "true" : undefined}
                onClick={() => onSelect(page.title)}
              >
                {page.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
