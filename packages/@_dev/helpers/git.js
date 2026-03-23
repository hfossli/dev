const { run } = require("./internal/process.js");
const { getWorktreeForBranch } = require("./internal/worktree.js");

function writeLine(text = "") {
  process.stdout.write(`${text}\n`);
}

function refExists(cwd, ref) {
  return run("git", ["show-ref", "--verify", "--quiet", ref], {
    cwd,
    allowFailure: true,
  }).status === 0;
}

function getCurrentBranch(cwd) {
  const currentBranch = run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
    cwd,
    allowFailure: true,
  }).stdout;

  if (currentBranch) {
    return {
      branch: currentBranch,
      detached: false,
    };
  }

  return {
    branch: "HEAD",
    detached: true,
  };
}

function resolveUpstream({ cwd, branch, detached, remote }) {
  if (!detached) {
    const upstream = run(
      "git",
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      {
        cwd,
        allowFailure: true,
      }
    ).stdout;
    if (upstream) return upstream;
  }

  if (detached) {
    const remoteHead = run(
      "git",
      ["symbolic-ref", "--quiet", `refs/remotes/${remote}/HEAD`, "--short"],
      {
        cwd,
        allowFailure: true,
      }
    ).stdout;

    if (remoteHead) {
      writeLine(`HEAD is detached; using remote default branch ${remoteHead}.`);
      return remoteHead;
    }

    const fallback = `${remote}/main`;
    if (refExists(cwd, `refs/remotes/${fallback}`)) {
      writeLine(`HEAD is detached; using fallback branch ${fallback}.`);
      return fallback;
    }

    throw new Error(
      `HEAD is detached and no ${remote} default branch could be determined.\nSet ${remote}/HEAD or check out a branch, then run again.`
    );
  }

  const inferred = `${remote}/${branch}`;
  if (refExists(cwd, `refs/remotes/${inferred}`)) {
    writeLine(`No upstream configured for ${branch}; using ${inferred}.`);
    return inferred;
  }

  throw new Error(
    `No upstream configured for ${branch} and no ${inferred} found.\nSet one with: git branch --set-upstream-to <remote>/<branch> ${branch}`
  );
}

function pullCurrentBranch({ cwd = process.cwd(), remote = "origin" } = {}) {
  const { branch, detached } = getCurrentBranch(cwd);
  const upstream = resolveUpstream({ cwd, branch, detached, remote });
  const upstreamRemote = upstream.split("/")[0];
  const upstreamBranch = upstream.slice(upstreamRemote.length + 1);

  writeLine(`Fetching ${upstreamRemote}/${upstreamBranch}...`);
  run("git", ["fetch", upstreamRemote, upstreamBranch], { cwd, stdio: "inherit" });

  writeLine(
    `Rebasing ${branch} onto ${upstream} (preferring remote changes on conflicts)...`
  );
  run("git", ["rebase", "--autostash", "-X", "ours", upstream], {
    cwd,
    stdio: "inherit",
  });

  writeLine();
  writeLine("Pull completed.");
  writeLine(`Current branch: ${branch}`);
  writeLine(`Rebased onto: ${upstream}`);
}

function mergeToMain({
  cwd = process.cwd(),
  remote = "origin",
  mainBranch = "main",
} = {}) {
  const { branch } = getCurrentBranch(cwd);
  const currentBranch = branch || "DETACHED";

  if (currentBranch === mainBranch) {
    writeLine(`On ${mainBranch}; pushing HEAD to ${remote}/${mainBranch}...`);
    run("git", ["push", remote, `HEAD:${mainBranch}`], { cwd, stdio: "inherit" });
    writeLine();
    writeLine("Merge completed.");
    writeLine(`Source branch: ${currentBranch}`);
    writeLine(`Remote updated: ${remote}/${mainBranch}`);
    return;
  }

  writeLine(`Fetching ${remote}/${mainBranch}...`);
  run("git", ["fetch", remote, mainBranch], { cwd, stdio: "inherit" });

  writeLine(`Rebasing ${currentBranch} onto ${remote}/${mainBranch}...`);
  run("git", ["rebase", `${remote}/${mainBranch}`], { cwd, stdio: "inherit" });

  writeLine(`Pushing HEAD to ${remote}/${mainBranch}...`);
  run("git", ["push", remote, `HEAD:${mainBranch}`], { cwd, stdio: "inherit" });

  const mainWorktreePath = getWorktreeForBranch({ cwd, branch: mainBranch });

  if (mainWorktreePath) {
    writeLine(`Updating local ${mainBranch} at ${mainWorktreePath}...`);
    run("git", ["-C", mainWorktreePath, "pull", "--ff-only", remote, mainBranch], {
      stdio: "inherit",
    });
  } else {
    writeLine(
      `No dedicated ${mainBranch} worktree found; syncing local ${mainBranch} ref from ${remote}/${mainBranch}...`
    );
    run("git", ["fetch", remote, mainBranch], { cwd, stdio: "inherit" });
    if (refExists(cwd, `refs/heads/${mainBranch}`)) {
      run("git", ["branch", "-f", mainBranch, `${remote}/${mainBranch}`], {
        cwd,
        stdio: "inherit",
      });
    } else {
      run("git", ["branch", mainBranch, `${remote}/${mainBranch}`], {
        cwd,
        stdio: "inherit",
      });
    }
  }

  writeLine();
  writeLine("Merge completed.");
  writeLine(`Source branch: ${currentBranch}`);
  writeLine(`Remote updated: ${remote}/${mainBranch}`);
}

module.exports = {
  mergeToMain,
  pullCurrentBranch,
};
