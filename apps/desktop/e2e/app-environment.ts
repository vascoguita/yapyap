// Editors built on Electron (such as VS Code) export ELECTRON_RUN_AS_NODE to
// their terminals, which would make a development build start as plain Node.js.
export function appEnvironment(origin: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  return { ...env, YAPYAP_TEST_WHATSAPP_ORIGIN: origin };
}
