import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// One QueryClient per browser mount. Holding it in useState keeps the same
// instance across re-renders but gives each user their own cache.
// On the server useState runs once per request — no queries fire until
// hydration since the status page doesn't use prefetchQuery.
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Matches the API's Cache-Control: max-age=60. After 60s React
            // Query will revalidate on next mount / focus.
            staleTime: 60_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
