import React from "react";
import DragWindowRegion from "@/components/DragWindowRegion";
import AppSidebar from "@/components/AppSidebar";
import SettingsPanel from "@/components/SettingsPanel";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  return (
    <div className="bg-background flex h-screen flex-col">
      <DragWindowRegion title="Angst+Pfister" />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar
          isSettingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((value) => !value)}
        />
        <div className="relative flex flex-1 overflow-hidden">
          <main
            className={`flex-1 overflow-y-auto p-6 pr-6 transition-[padding-right] ${settingsOpen ? "lg:pr-[26rem]" : ""}`}
          >
            {children}
          </main>
          {settingsOpen ? (
            <SettingsPanel onClose={() => setSettingsOpen(false)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
