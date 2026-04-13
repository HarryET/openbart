import { useRef, useState, useEffect, useCallback } from "react";
import type { Route } from "./+types/home";
import { BartMap, MAP_DIMENSIONS } from "../components/bart-map";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "openbart" },
    {
      name: "description",
      content: "open-source bay area rapit transit json api",
    },
    { property: "og:title", content: "openbart" },
    {
      property: "og:description",
      content: "open-source bay area rapit transit json api",
    },
    { property: "og:image", content: "/openbart-og.png" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: "openbart" },
    {
      name: "twitter:description",
      content: "open-source bay area rapit transit json api",
    },
    { name: "twitter:image", content: "/openbart-og.png" },
  ];
}

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);

  const updateLayout = useCallback(() => {
    if (!containerRef.current) return;
    const available = containerRef.current.clientHeight;
    const s = Math.min(1, available / MAP_DIMENSIONS.height);
    setScale(s);
    setContainerWidth(window.innerWidth);
  }, []);

  useEffect(() => {
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, [updateLayout]);

  const scaledW = MAP_DIMENSIONS.width * scale;
  const scaledH = MAP_DIMENSIONS.height * scale;
  const showPurple = containerWidth >= scaledW + 16 + 100; // 16px left padding + 100px min purple width

  return (
    <div className="font-mono h-screen flex flex-col overflow-hidden">
      <main className="flex-1 flex flex-col overflow-y-hidden overflow-x-auto min-h-0">
        <div className="pl-4 pt-4">
          <h1 className="text-sm mb-4 shrink-0">openbart</h1>
        </div>
        <div ref={containerRef} className="flex flex-1 min-h-0 pl-4 pb-4">
          <div className="shrink-0" style={{ width: scaledW, height: scaledH }}>
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <BartMap />
            </div>
          </div>
          {showPurple ? (
            <div className="flex-1" />
          ) : (
            <div className="shrink-0 w-16" />
          )}
        </div>
      </main>

      <footer className="w-full px-4 py-4 flex items-center justify-between font-mono text-sm shrink-0">
        <span>
          a project by{" "}
          <a
            href="https://harrybairstow.com?utm_source=openbart"
            className="hover:cursor-pointer hover:bg-black hover:text-white"
            target="_blank"
            rel="noopener noreferrer"
          >
            harry
          </a>
        </span>
        <div className="flex gap-2">
          <a
            href="/status"
            className="hover:cursor-pointer hover:bg-black hover:text-white"
          >
            status
          </a>
          <a
            href="/docs"
            className="hover:cursor-pointer hover:bg-black hover:text-white"
          >
            docs
          </a>
        </div>
      </footer>
    </div>
  );
}
