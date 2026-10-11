import { IfcAPI } from 'web-ifc';

let ready: Promise<IfcAPI> | undefined;

/** Lazily initialises a single web-ifc instance (WASM) shared by the process. */
export function getIfcApi(): Promise<IfcAPI> {
  ready ??= (async () => {
    const api = new IfcAPI();
    await api.Init();
    return api;
  })().catch((error: unknown) => {
    ready = undefined; // allow a later retry instead of caching the failure
    throw error;
  });
  return ready;
}
