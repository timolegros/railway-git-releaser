let commitSha: string | undefined;

// Type definitions for release states
type ReleaseState = 'not_started' | 'running' | 'success' | 'failed';

// Global error handlers for Deno
addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled Rejection:", event.reason);
  Deno.exit(1);
});

addEventListener("error", (event) => {
  console.error("Uncaught Error:", event.error);
  Deno.exit(1);
});

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
  
  // Read existing release log first
  let log: Record<string, ReleaseState> = {};
  try {
    const text = await Deno.readTextFile("release-log.json");
    log = JSON.parse(text);
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      throw new Error(`Error reading release-log.json: ${err}`);
    }
  }
  
  // Check if this commit has already been processed
  if (commitSha! in log) {
    console.log(`Release for commit ${commitSha} has already been executed. Result: ${log[commitSha!]}`);
    return;
  }
  
  // Mark as running
  log[commitSha!] = "running";
  await Deno.writeTextFile("release-log.json", JSON.stringify(log, null, 2));
  console.log("Release marked as running...");
  
  let state: ReleaseState;
  try {
    const process = new Deno.Command("bash", {
      args: ["clone.sh"],
      stdout: "inherit",
      stderr: "inherit",
    });
    const { code } = await process.output();
    state = code === 0 ? "success" : "failed";
    console.log("Release executed. Exit Code:", code, "State:", state);
  } catch (err) {
    console.error("Error running clone.sh:", err);
    state = "failed";
  }

  // Update release log with final result
  log[commitSha!] = state;
  await Deno.writeTextFile("release-log.json", JSON.stringify(log, null, 2));
  console.log("Release log updated:", log);
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  try {
    switch (url.pathname) {
      case "/healthcheck":
        return new Response("OK", { status: 200 });

      case "/releaseState":
        return await handleReleaseState(url);

      default:
        return new Response("Not Found", { status: 404 });
    }
  } catch (error) {
    console.error("Error handling request:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

async function handleReleaseState(url: URL): Promise<Response> {
  const commitSha = url.searchParams.get("commit-sha");

  if (!commitSha) {
    return new Response("Missing commit-sha parameter", { status: 400 });
  }

  try {
    // Read and parse the release-log.json file
    const releaseLogContent = await Deno.readTextFile("release-log.json");
    const releaseLog: Record<string, ReleaseState> = JSON.parse(releaseLogContent);

    // Check if the commit SHA exists as a property
    if (commitSha in releaseLog) {
      const state = releaseLog[commitSha];
      return new Response(JSON.stringify(state), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify("not_started" as ReleaseState), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // File doesn't exist, return not_started
      return new Response(JSON.stringify("not_started" as ReleaseState), {
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
