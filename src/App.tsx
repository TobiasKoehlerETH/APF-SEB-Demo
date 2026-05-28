import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import SensorReadout from "@/components/SensorReadout";
import LoadingScreen from "@/components/loading-screen";
import { DataCaptureProvider } from "@/contexts/DataCaptureContext";
import { SensorStreamProvider } from "@/contexts/SensorStreamContext";
import { syncThemeWithLocal } from "@/helpers/theme_helpers";
import BaseLayout from "@/layouts/BaseLayout";

export default function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    syncThemeWithLocal();
    document.documentElement.lang = "en";

    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <SensorStreamProvider>
      <DataCaptureProvider>
        <BaseLayout>
          <div className="flex h-full items-center justify-center">
            <SensorReadout />
          </div>
        </BaseLayout>
      </DataCaptureProvider>
    </SensorStreamProvider>
  );
}

const root = createRoot(document.getElementById("app")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
