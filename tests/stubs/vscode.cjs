// Minimal `vscode` stub for unit-testing modules that only touch config/logging.
const settings = {};
module.exports = {
  __settings: settings,
  workspace: {
    workspaceFolders: undefined,
    getConfiguration: () => ({ get: (k, d) => (k in settings ? settings[k] : d) }),
  },
  window: {
    createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, dispose() {} }),
  },
  Uri: { file: (p) => ({ fsPath: p }) },
};
