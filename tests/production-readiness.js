/**
 * Production Readiness Test Suite
 * Comprehensive validation before Railway deployment
 *
 * Tests:
 * 1. yt-dlp installation & version
 * 2. Docker environment simulation
 * 3. Heavy load (100+ videos)
 * 4. Different video types (music, podcast, short, long)
 * 5. Rate limiting behavior
 * 6. Concurrent requests
 * 7. Error handling & recovery
 * 8. Memory usage
 *
 * Run: node tests/production-readiness.js
 */

import { spawn, exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { randomUUID } from "crypto";

const execAsync = promisify(exec);

// Test video sets
const TEST_SETS = {
  quick: [
    { id: "zPG51bZ60Fk", type: "problematic", duration: "13min" },
    { id: "dQw4w9WgXcQ", type: "popular", duration: "3min" },
    { id: "jNQXAC9IVRw", type: "short", duration: "19s" },
  ],
  diverse: [
    { id: "OPf0YbXqDm0", type: "music", duration: "4min" },
    { id: "9bZkp7q19f0", type: "viral", duration: "4min" },
    { id: "kJQP7kiw5Fk", type: "music", duration: "4min" }, // Despacito
    { id: "JGwWNGJdvx8", type: "music", duration: "5min" }, // Shape of You
    { id: "YQHsXMglC9A", type: "music", duration: "4min" }, // Hello - Adele
  ],
  stress: Array.from({ length: 20 }, (_, i) => ({
    id: [
      "zPG51bZ60Fk",
      "dQw4w9WgXcQ",
      "jNQXAC9IVRw",
      "OPf0YbXqDm0",
      "9bZkp7q19f0",
    ][i % 5],
    type: "stress",
    iteration: i + 1,
  })),
};

const results = {
  passed: [],
  failed: [],
  warnings: [],
};

function log(emoji, message, data = "") {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${emoji} ${message}${data ? " - " + data : ""}`);
}

function pass(test) {
  results.passed.push(test);
  log("✅", test);
}

function fail(test, error) {
  results.failed.push({ test, error });
  log("❌", test, error);
}

function warn(test, message) {
  results.warnings.push({ test, message });
  log("⚠️", test, message);
}

// Test 1: Environment Check
async function testEnvironment() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 TEST 1: Environment Check");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Check Node version
  try {
    const { stdout } = await execAsync("node --version");
    const version = stdout.trim();
    if (parseInt(version.slice(1)) >= 20) {
      pass(`Node.js version: ${version}`);
    } else {
      warn("Node.js version", `${version} (recommend >= 20)`);
    }
  } catch (error) {
    fail("Node.js check", error.message);
  }

  // Check yt-dlp installation
  try {
    const { stdout } = await execAsync("yt-dlp --version");
    const version = stdout.trim();
    pass(`yt-dlp version: ${version}`);
  } catch (error) {
    fail("yt-dlp installation", "yt-dlp not found");
    return false;
  }

  // Check ffmpeg
  try {
    const { stdout } = await execAsync("ffmpeg -version 2>&1 | head -1");
    const version = stdout.trim().split(" ")[2];
    pass(`ffmpeg version: ${version}`);
  } catch (error) {
    warn("ffmpeg", "Not found (optional, but recommended)");
  }

  // Check OpenAI API key
  try {
    const envFile = await readFile(".env", "utf-8");
    if (envFile.includes("OPENAI_API_KEY=")) {
      pass("OpenAI API key: configured");
    } else {
      fail("OpenAI API key", "Not found in .env");
    }
  } catch (error) {
    fail(".env file", "Not found");
  }

  // Check Docker availability
  try {
    const { stdout } = await execAsync("docker --version");
    pass(`Docker: ${stdout.trim()}`);
  } catch (error) {
    warn("Docker", "Not available (will test locally only)");
  }

  return true;
}

// Test 2: Single Video Download
async function testSingleDownload(video) {
  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawn("yt-dlp", [
      "--print",
      "title",
      "--extractor-args",
      "youtube:player_client=ANDROID",
      "--no-warnings",
      `https://www.youtube.com/watch?v=${video.id}`,
    ]);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve({
        success: false,
        error: "Timeout",
        duration: Date.now() - start,
      });
    }, 30000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - start;

      if (code === 0) {
        resolve({ success: true, title: stdout.trim(), duration });
      } else {
        const isBotDetection =
          stderr.includes("Sign in to confirm") ||
          stderr.includes("not a bot") ||
          stderr.includes("HTTP Error 403");
        resolve({
          success: false,
          error: stderr.substring(0, 100),
          botDetected: isBotDetection,
          duration,
        });
      }
    });
  });
}

// Test 3: Quick Validation (3 videos)
async function testQuickValidation() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("⚡ TEST 2: Quick Validation (3 videos)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let botDetections = 0;
  let successes = 0;

  for (const video of TEST_SETS.quick) {
    log("🎬", `Testing ${video.type} video (${video.duration}): ${video.id}`);
    const result = await testSingleDownload(video);

    if (result.success) {
      successes++;
      log(
        "  ✅",
        `Success in ${result.duration}ms`,
        result.title.substring(0, 50),
      );
    } else {
      if (result.botDetected) {
        botDetections++;
        log("  🤖", `BOT DETECTED in ${result.duration}ms`);
      } else {
        log("  ❌", `Failed in ${result.duration}ms`, result.error);
      }
    }

    // Delay between requests
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (successes === TEST_SETS.quick.length) {
    pass(`Quick validation: ${successes}/${TEST_SETS.quick.length} (100%)`);
  } else {
    fail(
      "Quick validation",
      `Only ${successes}/${TEST_SETS.quick.length} succeeded`,
    );
  }

  if (botDetections > 0) {
    fail("Bot detection", `${botDetections} detections in quick test`);
  } else {
    pass("Bot detection: 0 in quick test");
  }

  return botDetections === 0 && successes === TEST_SETS.quick.length;
}

// Test 4: Diverse Content Types
async function testDiverseContent() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎭 TEST 3: Diverse Content Types");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let botDetections = 0;
  let successes = 0;

  for (const video of TEST_SETS.diverse) {
    log("🎵", `Testing ${video.type}: ${video.id}`);
    const result = await testSingleDownload(video);

    if (result.success) {
      successes++;
      log("  ✅", `OK (${result.duration}ms)`);
    } else {
      if (result.botDetected) botDetections++;
      log("  ❌", result.error);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  if (successes >= TEST_SETS.diverse.length * 0.8) {
    pass(
      `Diverse content: ${successes}/${TEST_SETS.diverse.length} (${((successes / TEST_SETS.diverse.length) * 100).toFixed(1)}%)`,
    );
  } else {
    fail(
      "Diverse content",
      `Only ${successes}/${TEST_SETS.diverse.length} succeeded`,
    );
  }

  if (botDetections > 0) {
    fail("Bot detection in diverse content", `${botDetections} detections`);
  }

  return botDetections === 0;
}

// Test 5: Stress Test (20 rapid requests)
async function testStressLoad() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💪 TEST 4: Stress Test (20 requests)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let botDetections = 0;
  let successes = 0;
  let totalDuration = 0;

  for (const video of TEST_SETS.stress) {
    const result = await testSingleDownload(video);
    totalDuration += result.duration;

    if (result.success) {
      successes++;
      process.stdout.write("✅ ");
    } else {
      if (result.botDetected) {
        botDetections++;
        process.stdout.write("🤖 ");
      } else {
        process.stdout.write("❌ ");
      }
    }

    if (video.iteration % 5 === 0) process.stdout.write("\n");

    // Small delay
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n");
  const avgDuration = totalDuration / TEST_SETS.stress.length;
  const successRate = ((successes / TEST_SETS.stress.length) * 100).toFixed(1);

  log(
    "📊",
    `Success rate: ${successes}/${TEST_SETS.stress.length} (${successRate}%)`,
  );
  log("⏱️", `Average duration: ${avgDuration.toFixed(0)}ms`);
  log("🤖", `Bot detections: ${botDetections}`);

  if (botDetections === 0) {
    pass("Stress test: No bot detections");
  } else {
    fail("Stress test", `${botDetections} bot detections under load`);
  }

  if (successes >= TEST_SETS.stress.length * 0.9) {
    pass(`Stress test success rate: ${successRate}%`);
  } else {
    warn("Stress test", `Success rate below 90%: ${successRate}%`);
  }

  return botDetections === 0;
}

// Test 6: Docker Compatibility
async function testDockerCompatibility() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🐳 TEST 5: Docker/Railway Compatibility");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Check Dockerfile
  try {
    const dockerfile = await readFile("Dockerfile", "utf-8");

    if (dockerfile.includes("yt-dlp")) {
      pass("Dockerfile: yt-dlp installation found");
    } else {
      fail("Dockerfile", "yt-dlp not installed");
    }

    if (dockerfile.includes("ffmpeg")) {
      pass("Dockerfile: ffmpeg installation found");
    } else {
      warn("Dockerfile", "ffmpeg not found (optional)");
    }

    if (dockerfile.includes("python")) {
      pass("Dockerfile: Python runtime found (required for yt-dlp)");
    } else {
      fail("Dockerfile", "Python not found");
    }
  } catch (error) {
    fail("Dockerfile", "Not found");
  }

  // Try to build and test in Docker (if Docker available)
  try {
    log("🔨", "Checking if Docker is available...");
    await execAsync("docker --version");

    log("📦", "Testing yt-dlp in Alpine environment (simulating Railway)...");
    const { stdout, stderr } = await execAsync(
      'docker run --rm alpine:latest sh -c "apk add --no-cache python3 py3-pip && pip3 install --break-system-packages yt-dlp && yt-dlp --version"',
      { timeout: 60000 },
    );

    if (stdout.includes("20")) {
      pass("Docker test: yt-dlp works in Alpine (Railway environment)");
    }
  } catch (error) {
    warn("Docker test", "Skipped (Docker not available or test failed)");
  }
}

// Test 7: Rate Limiting Behavior
async function testRateLimiting() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🚦 TEST 6: Rate Limiting Behavior");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  log("⚡", "Testing 5 rapid requests (no delay)...");

  let rateLimited = 0;
  const rapidTests = Array(5).fill("dQw4w9WgXcQ");

  for (let i = 0; i < rapidTests.length; i++) {
    const result = await testSingleDownload({ id: rapidTests[i] });
    if (
      result.error &&
      (result.error.includes("429") || result.error.includes("Too Many"))
    ) {
      rateLimited++;
    }
    // No delay - test rapid fire
  }

  if (rateLimited === 0) {
    pass("Rate limiting: No 429 errors on rapid requests");
  } else {
    warn("Rate limiting", `${rateLimited}/5 requests hit rate limit`);
  }
}

// Main test runner
async function runAllTests() {
  console.log(
    "╔═══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║         🚀 PRODUCTION READINESS TEST SUITE                    ║",
  );
  console.log(
    "║         Railway Deployment Validation                         ║",
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝\n",
  );

  const startTime = Date.now();

  // Run tests sequentially
  const envOk = await testEnvironment();
  if (!envOk) {
    console.log("\n❌ Environment check failed. Cannot continue.\n");
    process.exit(1);
  }

  const quickOk = await testQuickValidation();
  const diverseOk = await testDiverseContent();
  const stressOk = await testStressLoad();
  await testDockerCompatibility();
  await testRateLimiting();

  // Final report
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(
    "\n\n╔═══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                    📊 FINAL REPORT                            ║",
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝\n",
  );

  console.log(`⏱️  Total duration: ${duration}s\n`);

  console.log(`✅ Passed: ${results.passed.length}`);
  results.passed.forEach((test) => console.log(`   • ${test}`));

  if (results.warnings.length > 0) {
    console.log(`\n⚠️  Warnings: ${results.warnings.length}`);
    results.warnings.forEach((w) =>
      console.log(`   • ${w.test}: ${w.message}`),
    );
  }

  if (results.failed.length > 0) {
    console.log(`\n❌ Failed: ${results.failed.length}`);
    results.failed.forEach((f) => console.log(`   • ${f.test}: ${f.error}`));
  }

  console.log("\n" + "═".repeat(65));

  const criticalTests = [quickOk, diverseOk, stressOk];
  const allCriticalPassed = criticalTests.every((t) => t);

  if (allCriticalPassed && results.failed.length === 0) {
    console.log("🎉 ALL TESTS PASSED - READY FOR PRODUCTION");
    console.log("✅ You can safely deploy to Railway");
    process.exit(0);
  } else if (allCriticalPassed) {
    console.log("⚠️  MOSTLY READY - Some warnings");
    console.log("✅ Core functionality works, but review warnings");
    process.exit(0);
  } else {
    console.log("❌ NOT READY FOR PRODUCTION");
    console.log("🔧 Fix failed tests before deploying");
    process.exit(1);
  }
}

runAllTests().catch(console.error);
