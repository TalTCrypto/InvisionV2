/**
 * Quick test script for browser detection
 * Run with: npx tsx src/server/utils/__test-browser-detection.ts
 */

import { readFile, access } from "fs/promises";
import { homedir, platform } from "os";
import { join } from "path";

async function detectAvailableBrowsers(): Promise<string[]> {
  const browsers = ["chrome", "firefox", "edge", "safari", "brave"];
  const available: string[] = [];

  // Browser cookie paths by OS and browser
  const cookiePaths: Record<string, Record<string, string>> = {
    darwin: {
      // macOS
      chrome: join(
        homedir(),
        "Library/Application Support/Google/Chrome/Default/Cookies",
      ),
      firefox: join(homedir(), "Library/Application Support/Firefox/Profiles"),
      edge: join(
        homedir(),
        "Library/Application Support/Microsoft Edge/Default/Cookies",
      ),
      safari: join(homedir(), "Library/Cookies/Cookies.binarycookies"),
      brave: join(
        homedir(),
        "Library/Application Support/BraveSoftware/Brave-Browser/Default/Cookies",
      ),
    },
    linux: {
      chrome: join(homedir(), ".config/google-chrome/Default/Cookies"),
      firefox: join(homedir(), ".mozilla/firefox"),
      edge: join(homedir(), ".config/microsoft-edge/Default/Cookies"),
      brave: join(
        homedir(),
        ".config/BraveSoftware/Brave-Browser/Default/Cookies",
      ),
    },
    win32: {
      chrome: join(
        homedir(),
        "AppData/Local/Google/Chrome/User Data/Default/Network/Cookies",
      ),
      firefox: join(homedir(), "AppData/Roaming/Mozilla/Firefox/Profiles"),
      edge: join(
        homedir(),
        "AppData/Local/Microsoft/Edge/User Data/Default/Network/Cookies",
      ),
      brave: join(
        homedir(),
        "AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies",
      ),
    },
  };

  const osPaths = cookiePaths[platform()] ?? {};

  for (const browser of browsers) {
    const path = osPaths[browser];
    if (!path) {
      console.log(`  ❌ ${browser}: no path configured for ${platform()}`);
      continue;
    }

    try {
      await access(path);
      available.push(browser);
      console.log(`  ✅ ${browser}: found at ${path}`);
    } catch {
      console.log(`  ❌ ${browser}: not found at ${path}`);
    }
  }

  return available;
}

async function main() {
  console.log("🔍 Browser Detection Test\n");
  console.log(`Platform: ${platform()}`);
  console.log(`Home dir: ${homedir()}\n`);

  const browsers = await detectAvailableBrowsers();

  console.log(
    `\n✨ Available browsers: ${browsers.length > 0 ? browsers.join(", ") : "none"}`,
  );

  if (browsers.length > 0) {
    console.log("\n📋 Strategies that will be attempted:");
    console.log(browsers.map((b, i) => `  ${i + 1}. cookies:${b}`).join("\n"));
    console.log("  " + (browsers.length + 1) + ". player:ANDROID_TESTSUITE");
    console.log("  " + (browsers.length + 2) + ". player:ANDROID_EMBEDDED");
    console.log("  " + (browsers.length + 3) + ". player:IOS");
    console.log("  " + (browsers.length + 4) + ". player:ANDROID");
  } else {
    console.log(
      "\n⚠️  No browsers found. Will use player client strategies only:",
    );
    console.log("  1. player:ANDROID_TESTSUITE");
    console.log("  2. player:ANDROID_EMBEDDED");
    console.log("  3. player:IOS");
    console.log("  4. player:ANDROID");
  }

  console.log(
    "\n💡 Tip: If you have YouTube cookies in your browser, yt-dlp can use them to bypass bot detection.",
  );
  console.log(
    "   Make sure you're signed in to YouTube in your browser for best results.\n",
  );
}

main().catch(console.error);
