import * as fileStore from "./file-store.js";
import * as macos from "./macos-keychain.js";
import * as linux from "./linux-secret-service.js";
import * as windows from "./windows-credential-manager.js";

function preferredBackendName() {
  const explicit = process.env.AGENT_MANAGER_CREDENTIAL_BACKEND;
  if (explicit) {
    return explicit;
  }
  if (process.platform === "darwin") {
    return "macos";
  }
  if (process.platform === "linux") {
    return "linux";
  }
  if (process.platform === "win32") {
    return "windows";
  }
  return "file";
}

function backendByName(name) {
  if (name === "macos") return macos;
  if (name === "linux") return linux;
  if (name === "windows") return windows;
  return fileStore;
}

async function withFallback(fnName, rootDir, ...args) {
  const preferred = preferredBackendName();
  const primary = backendByName(preferred);

  try {
    return await primary[fnName](rootDir, ...args);
  } catch (error) {
    if (preferred === "file") {
      throw error;
    }
    return fileStore[fnName](rootDir, ...args);
  }
}

export async function storeCredential(rootDir, key, value) {
  return withFallback("storeCredential", rootDir, key, value);
}

export async function getCredential(rootDir, key) {
  return withFallback("getCredential", rootDir, key);
}

export async function listCredentials(rootDir) {
  return withFallback("listCredentials", rootDir);
}
