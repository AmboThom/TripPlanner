import ReactMarkdown from "react-markdown";

// Only these schemes become links. react-markdown already strips javascript: and the
// like; this also drops relative and fragment links, which mean nothing to a page the
// model wrote.
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

/**
 * Renders a page body, which is text a model wrote and a user can steer.
 *
 * react-markdown with no plugins: raw HTML is not interpreted, so a script tag shows
 * up as visible text. Images are disallowed, since a remote image in model-written
 * text is a tracking and exfiltration channel.
 */
export default function PageBody({ body }: { body: string }) {
  return (
    <ReactMarkdown
      disallowedElements={["img"]}
      components={{
        a: ({ href, children }) =>
          href && SAFE_LINK.test(href) ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ) : (
            <span>{children}</span>
          ),
      }}
    >
      {body}
    </ReactMarkdown>
  );
}
