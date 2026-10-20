import { render } from "solid-js/web";
import { App } from "@/app/App";
import { env } from "@/env";
import "@/styles/app.css";

async function bootstrap() {
  if (env.apiMock) {
    const { startMockBackend } = await import("@/mocks/browser");
    await startMockBackend();
  }
  const root = document.getElementById("root");
  if (!root) throw new Error("#root not found");
  render(() => <App />, root);
}

void bootstrap();
