/**
 * Bot Detection Stress Test
 * Tests multiple videos in succession to verify anti-bot measures work
 * Simulates real-world usage patterns to avoid detection
 *
 * Run: node tests/bot-detection-stress.js
 */

import { spawn } from "child_process";
import { randomUUID } from "crypto";

const TEST_VIDEOS = [
  { id: "zPG51bZ60Fk", name: "Previously problematic video" },
  { id: "dQw4w9WgXcQ", name: "Rick Astley - Popular video" },
  { id: "jNQXAC9IVRw", name: "Me at the zoo - First YouTube video" },
  { id: "OPf0YbXqDm0", name: "Mark Ronson - Uptown Funk" },
  { id: "9bZkp7q19f0", name: "PSY - GANGNAM STYLE" },
];

const PLAYER_CLIENTS = [
  "ANDROID",
  "ANDROID_TESTSUITE",
  "ANDROID_EMBEDDED",
  "IOS",
  "MWEB",
  "WEB",
];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function executeYtDlp(videoId, client, userAgent) {
  return new Promise((resolve, reject) => {
    const args = [
      "--print",
      "title",
      "--no-warnings",
      "--user-agent",
      userAgent,
    ];

    if (client) {
      args.push("--extractor-args", `youtube:player_client=${client}`);
    }

    args.push(`https://www.youtube.com/watch?v=${videoId}`);

    const proc = spawn("yt-dlp", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Timeout after 30s"));
    }, 30000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ success: true, title: stdout.trim(), stderr });
      } else {
        const isBotDetection =
          stderr.includes("Sign in to confirm") ||
          stderr.includes("not a bot") ||
          stderr.includes("HTTP Error 403") ||
          stderr.includes("HTTP Error 429");

        resolve({
          success: false,
          botDetected: isBotDetection,
          error: stderr.substring(0, 200),
        });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function testClientAgainstVideo(videoId, videoName, client, userAgent) {
  const clientName = client || "default";
  const start = Date.now();

  try {
    const result = await executeYtDlp(videoId, client, userAgent);
    const duration = Date.now() - start;

    if (result.success) {
      console.log(
        `  ✅ ${clientName.padEnd(20)} ${duration}ms - ${result.title.substring(0, 50)}`,
      );
      return {
        success: true,
        client: clientName,
        duration,
        botDetected: false,
      };
    } else {
      const status = result.botDetected ? "🤖 BOT DETECTED" : "❌ Failed";
      console.log(
        `  ${status} ${clientName.padEnd(20)} ${duration}ms - ${result.error}`,
      );
      return {
        success: false,
        client: clientName,
        duration,
        botDetected: result.botDetected,
      };
    }
  } catch (error) {
    const duration = Date.now() - start;
    console.log(
      `  ❌ ${clientName.padEnd(20)} ${duration}ms - ${error.message}`,
    );
    return {
      success: false,
      client: clientName,
      duration,
      error: error.message,
    };
  }
}

async function testVideo(video, testIndex, totalAttempts) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(
    `Test ${testIndex}/${totalAttempts}: ${video.name} (${video.id})`,
  );
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const results = [];

  // Test each client with random user agent
  for (const client of PLAYER_CLIENTS) {
    const userAgent =
      USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const result = await testClientAgainstVideo(
      video.id,
      video.name,
      client,
      userAgent,
    );
    results.push(result);

    // Random delay between tests (1-3s)
    const delayMs = Math.floor(Math.random() * 2000) + 1000;
    await delay(delayMs);
  }

  // Test default (no client)
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const result = await testClientAgainstVideo(
    video.id,
    video.name,
    null,
    userAgent,
  );
  results.push(result);

  return results;
}

async function runStressTest() {
  console.log("🤖 Bot Detection Stress Test\n");
  console.log("Testing multiple videos with all player clients");
  console.log("to verify anti-bot measures effectiveness\n");

  const allResults = [];
  const totalVideos = TEST_VIDEOS.length;

  for (let i = 0; i < TEST_VIDEOS.length; i++) {
    const video = TEST_VIDEOS[i];
    const results = await testVideo(video, i + 1, totalVideos);
    allResults.push({ video: video.name, results });

    // Random delay between videos (2-5s)
    if (i < TEST_VIDEOS.length - 1) {
      const delayMs = Math.floor(Math.random() * 3000) + 2000;
      console.log(
        `\n⏳ Waiting ${(delayMs / 1000).toFixed(1)}s before next video...\n`,
      );
      await delay(delayMs);
    }
  }

  // Summary
  console.log("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 SUMMARY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const clientStats = {};
  let totalBotDetections = 0;
  let totalSuccess = 0;
  let totalAttempts = 0;

  for (const { video, results } of allResults) {
    for (const result of results) {
      totalAttempts++;
      if (!clientStats[result.client]) {
        clientStats[result.client] = { success: 0, fail: 0, botDetected: 0 };
      }

      if (result.success) {
        clientStats[result.client].success++;
        totalSuccess++;
      } else {
        clientStats[result.client].fail++;
        if (result.botDetected) {
          clientStats[result.client].botDetected++;
          totalBotDetections++;
        }
      }
    }
  }

  console.log("Client Performance:");
  for (const [client, stats] of Object.entries(clientStats)) {
    const successRate = (
      (stats.success / (stats.success + stats.fail)) *
      100
    ).toFixed(1);
    const botRate =
      stats.fail > 0
        ? ((stats.botDetected / stats.fail) * 100).toFixed(1)
        : "0.0";
    const icon =
      stats.success > stats.fail ? "✅" : stats.botDetected > 0 ? "🤖" : "❌";

    console.log(
      `  ${icon} ${client.padEnd(20)} Success: ${stats.success}/${stats.success + stats.fail} (${successRate}%) | Bot Detections: ${stats.botDetected} (${botRate}% of failures)`,
    );
  }

  const overallSuccessRate = ((totalSuccess / totalAttempts) * 100).toFixed(1);
  const botDetectionRate =
    totalAttempts > 0
      ? ((totalBotDetections / totalAttempts) * 100).toFixed(1)
      : "0.0";

  console.log("\nOverall:");
  console.log(`  Total Tests: ${totalAttempts}`);
  console.log(
    `  Success: ${totalSuccess}/${totalAttempts} (${overallSuccessRate}%)`,
  );
  console.log(`  Bot Detections: ${totalBotDetections} (${botDetectionRate}%)`);

  if (totalBotDetections > 0) {
    console.log("\n⚠️  Bot detections found! Recommendations:");
    console.log("  1. Increase random delays between requests");
    console.log("  2. Add more User-Agent variation");
    console.log("  3. Consider using residential proxies");
    console.log("  4. Implement request fingerprint randomization");
  } else if (overallSuccessRate >= 80) {
    console.log("\n✅ Excellent! Low bot detection rate. System is robust.");
  } else {
    console.log(
      "\n⚠️  Success rate below 80%. Consider improving fallback strategies.",
    );
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

runStressTest().catch(console.error);
