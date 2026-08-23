import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const workflowSource = await readFile(
  new URL("../.github/workflows/pages.yml", import.meta.url),
  "utf8",
);

function workflowStep(name) {
  const marker = `      - name: ${name}`;
  const start = workflowSource.indexOf(marker);
  assert.ok(start >= 0, `workflow step must exist: ${name}`);
  const next = workflowSource.indexOf("\n      - name: ", start + marker.length);
  return workflowSource.slice(start, next < 0 ? workflowSource.length : next);
}

function moderationSchemaProbeSource() {
  const step = workflowStep("Verify moderation schema");
  const opening = "          node <<'NODE'\n";
  const start = step.indexOf(opening);
  const end = step.indexOf("\n          NODE", start + opening.length);
  assert.ok(start >= 0 && end > start, "moderation schema probe must remain an executable Node heredoc");
  return step
    .slice(start + opening.length, end)
    .replace(/^ {10}/gm, "");
}

async function runModerationSchemaProbe(status) {
  const directory = await mkdtemp(join(tmpdir(), "question-wall-schema-"));
  const environmentFile = join(directory, "github-env");
  try {
    const result = spawnSync(process.execPath, ["-e", moderationSchemaProbeSource()], {
      encoding: "utf8",
      env: {
        ...process.env,
        MODERATION_STATUS: JSON.stringify(status),
        GITHUB_ENV: environmentFile,
      },
    });
    const environment = await readFile(environmentFile, "utf8").catch(() => "");
    return { ...result, environment };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("Pages accepts schema v3 and disables photo-only deployment probes", async () => {
  const result = await runModerationSchemaProbe({
    schemaVersion: 3,
    hardeningVersion: 1,
    submissionsRequireReview: true,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.environment, /^PHOTO_NOTES_READY=false$/m);

  for (const name of [
    "Verify public photo-note projection",
    "Verify photo media function and CORS",
  ]) {
    assert.match(
      workflowStep(name),
      /if: \$\{\{ env\.PHOTO_NOTES_READY == 'true' \}\}/,
      `${name} must be skipped unless the complete v4 contract is ready`,
    );
  }
});

test("Pages accepts only a complete schema v4 photo-media contract", async (t) => {
  const complete = {
    schemaVersion: 4,
    hardeningVersion: 1,
    submissionsRequireReview: true,
    photoNotesEnabled: true,
    photoUploadMode: "moderator_only",
    photoMediaServiceBoundaryVersion: 1,
  };
  const accepted = await runModerationSchemaProbe(complete);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.environment, /^PHOTO_NOTES_READY=true$/m);

  const invalidCases = [
    ["missing 0006 boundary", { ...complete, photoMediaServiceBoundaryVersion: undefined }],
    ["wrong 0006 boundary", { ...complete, photoMediaServiceBoundaryVersion: 0 }],
    ["photo notes disabled", { ...complete, photoNotesEnabled: false }],
    ["visitor photo uploads", { ...complete, photoUploadMode: "public" }],
    ["review bypass", { ...complete, submissionsRequireReview: false }],
    ["unknown schema", { ...complete, schemaVersion: 5 }],
  ];

  for (const [name, status] of invalidCases) {
    await t.test(name, async () => {
      const rejected = await runModerationSchemaProbe(status);
      assert.notEqual(rejected.status, 0, "an incomplete or unknown contract must fail deployment");
      assert.equal(rejected.environment, "");
    });
  }
});

test("Pages keeps the checked-in 0006 service boundary in its release contract", () => {
  const validation = workflowStep("Validate static application");
  assert.match(validation, /test -f supabase\/migrations\/0006_photo_media_service_boundary\.sql/);
  assert.match(validation, /create or replace function public\.edge_moderate_photo_note/);
  assert.match(validation, /create or replace function public\.edge_hide_reported_photo/);
  assert.match(validation, /public media actions must use photo-note-media/);
  assert.match(validation, /'photoMediaServiceBoundaryVersion', 1/);
  assert.match(
    workflowStep("Verify moderation schema"),
    /status\?\.photoMediaServiceBoundaryVersion === 1/,
  );
});
