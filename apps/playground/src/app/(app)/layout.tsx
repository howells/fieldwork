// The playground shell. It lives in a layout so it stays mounted while the
// tool guide's pages change: the task in view, its draft, a run in flight and
// the settings all survive a trip to the guide and back.
import { connection } from "next/server";
import type { ReactNode } from "react";

import { Playground } from "@/components/playground";
import { providerCatalogue } from "@/server/providers";

const AppLayout = async ({ children }: { children: ReactNode }) => {
  // Which provider can do what, and which keys the server holds, are read on
  // the server from the SDK; the keys themselves never leave the server.
  await connection();
  return <Playground providers={providerCatalogue()}>{children}</Playground>;
};

export default AppLayout;
