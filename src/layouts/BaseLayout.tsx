import React from "react";
import DragWindowRegion from "@/components/DragWindowRegion";
import AppSidebar from "@/components/AppSidebar";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background flex h-screen flex-col">
      <DragWindowRegion title="Angst+Pfister" />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <div className="relative flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6 pr-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
