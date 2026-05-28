import { getCurrentWindow } from "@tauri-apps/api/window";

export async function minimizeWindow() {
  await getCurrentWindow().minimize();
}
export async function maximizeWindow() {
  const currentWindow = getCurrentWindow();
  if (await currentWindow.isMaximized()) {
    await currentWindow.unmaximize();
  } else {
    await currentWindow.maximize();
  }
}
export async function closeWindow() {
  await getCurrentWindow().close();
}
