import Workspace from "@/components/Workspace";
import { listMessages, listPages, readPage } from "@/lib/db";
import type { PageView } from "@/lib/pages-client";

// The conversation and the pages are read from the store on every request. Next
// prerenders a page that uses no request-time API at build time, which would freeze
// today's data into the build output and open the database during `next build`.
export const dynamic = "force-dynamic";

export default function Home() {
  const messages = listMessages().map(({ role, content }) => ({ role, content }));

  // Newest first, as the store orders them. A page that vanishes between the list
  // and the read is skipped rather than failing the whole screen. Only the three
  // fields the client renders are passed: everything handed to a client component is
  // serialized into the page.
  const pages: PageView[] = [];
  for (const { title } of listPages()) {
    const page = readPage(title);
    if (page) pages.push({ title: page.title, body: page.body, updatedAt: page.updatedAt });
  }

  return (
    <main>
      <Workspace initialMessages={messages} pages={pages} />
    </main>
  );
}
