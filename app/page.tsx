import Chat from "@/components/Chat";
import { listMessages } from "@/lib/db";

// The conversation is read from the store on every request. Next prerenders a page
// that uses no request-time API at build time, which would freeze today's
// conversation into the build output and open the database during `next build`.
export const dynamic = "force-dynamic";

export default function Home() {
  const messages = listMessages().map(({ role, content }) => ({ role, content }));

  return (
    <main>
      <Chat initialMessages={messages} />
    </main>
  );
}
