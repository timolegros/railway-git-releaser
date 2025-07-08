let commitSha: string | undefined;

export function main() {
  commitSha = Deno.env.get("RAILWAY_GIT_COMMIT_SHA");
  if (!commitSha) {
    throw new Error("RAILWAY_GIT_COMMIT_SHA env var not set");
  }

  const port = 8000;

  // Start release execution in parallel (fire-and-forget)
  executeRelease();

  // Start HTTP server and keep process alive
  console.log(`HTTP server running on port ${port}`);
  Deno.serve({ port }, handleRequest);
}

async function executeRelease() {
  console.log("Executing release...");
  let success: boolean;
  try {
    const process = new Deno.Command("bash", {
      args: ["clone.sh"],
      stdout: "inherit",
      stderr: "inherit",
    });
    const { code } = await process.output();
    success = code === 0;
    console.log("Release executed. Exit Code:", code);
  } catch (err) {
    console.error("Error running clone.sh:", err);
    success = false;
  }

  // Read or initialize release-log.json
  let log: Record<string, boolean> = {};
  try {
    const text = await Deno.readTextFile("release-log.json");
    log = JSON.parse(text);
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      console.error("Error reading release-log.json:", err);
    }
  }
  log[commitSha!] = success;
  await Deno.writeTextFile("release-log.json", JSON.stringify(log, null, 2));
  console.log("Release log updated:", log);
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  try {
    switch (url.pathname) {
      case "/healthcheck":
        return new Response("OK", { status: 200 });

      case "/isDeployed":
        return await handleIsDeployed(url);

      default:
        return new Response("Not Found", { status: 404 });
    }
  } catch (error) {
    console.error("Error handling request:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

async function handleIsDeployed(url: URL): Promise<Response> {
  const commitSha = url.searchParams.get("commit-sha");

  if (!commitSha) {
    return new Response("Missing commit-sha parameter", { status: 400 });
  }

  try {
    // Read and parse the release-log.json file
    const releaseLogContent = await Deno.readTextFile("release-log.json");
    const releaseLog = JSON.parse(releaseLogContent);

    // Check if the commit SHA exists as a property
    if (commitSha in releaseLog) {
      return new Response(JSON.stringify(releaseLog[commitSha]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify(false), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // File doesn't exist, return false
      return new Response(JSON.stringify(false), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    console.error("Error reading release-log.json:", error);
    return new Response("Error reading release log", { status: 500 });
  }
}

if (import.meta.main) {
  main();
}
