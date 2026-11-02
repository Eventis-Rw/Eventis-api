export type RuntimeName = "bun" | "node";

export function runtimeName(): RuntimeName {
  return typeof globalThis.Bun === "undefined" ? "node" : "bun";
}

export function runtimeVersion(): string {
  return runtimeName() === "bun"
    ? (globalThis.Bun?.version ?? "unknown")
    : process.versions.node;
}

function parseMajorMinor(version: string): [number, number] {
  const [majorText = "0", minorText = "0"] = version.split(".");
  const major = Number.parseInt(majorText, 10);
  const minor = Number.parseInt(minorText, 10);

  if (Number.isNaN(major) || Number.isNaN(minor)) {
    throw new Error(
      `Unsupported runtime version ${version}. This API requires Node >= 18.18.0 or Bun >= 1.4.0. Use 'nvm use 20' or 'bun run dev'.`,
    );
  }

  return [major, minor];
}

export function assertSupportedRuntime(
  runtime: RuntimeName = runtimeName(),
  version: string = runtimeVersion(),
): void {
  if (runtime === "bun") {
    const [major, minor] = parseMajorMinor(version);
    if (major < 1 || (major === 1 && minor < 4)) {
      throw new Error(
        `Unsupported Bun version ${version}. This API requires Node >= 18.18.0 or Bun >= 1.4.0. Use 'nvm use 20' or 'bun run dev'.`,
      );
    }
    return;
  }

  const [major, minor] = parseMajorMinor(version);
  if (major < 18 || (major === 18 && minor < 18)) {
    throw new Error(
      `Unsupported Node.js version ${version}. This API requires Node >= 18.18.0 or Bun >= 1.4.0. Use 'nvm use 20' or 'bun run dev'.`,
    );
  }
}

declare global {
  var Bun: { version: string } | undefined;
}
