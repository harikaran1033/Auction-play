import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { io } from "socket.io-client";
import { loadCatalog } from "../../apps/server/src/data/catalog.js";
test.beforeAll(async ({ request }) => {
  const health = await (await request.get("/api/health")).json();
  expect(health.authMode).toBe("development");
  expect(health.storage).toBe("local-development");
  expect(health.voiceProvider).toBe("webrtc");
});

async function account(context: BrowserContext, name: string) {
  const response = await context.request.post("/api/auth", {
    data: {
      email: `${name}-${Date.now()}@example.test`,
      password: "Cricket123!",
      name,
      register: true,
    },
  });
  if (!response.ok())
    throw new Error(
      `Voice test registration failed: ${response.status()} ${(await response.text()).slice(0, 200)}`,
    );
  const auth = await response.json();
  await context.addInitScript((token) => {
    localStorage.setItem("cricket-token", token);
    const globals = window as any;
    globals.voiceTestTracks = [];
    globals.voiceTestConnections = [];
    const Peer = RTCPeerConnection;
    globals.RTCPeerConnection = class extends Peer {
      constructor(config?: RTCConfiguration) {
        super(config);
        globals.voiceTestConnections.push(this);
      }
    };
    globals.voiceTestDeny = false;
    navigator.mediaDevices.getUserMedia = async () => {
      if (globals.voiceTestDeny)
        throw new DOMException("Test permission denial", "NotAllowedError");
      // Real browser MediaStream, generated without the unavailable Windows audio-capture driver.
      const context = new AudioContext({
        sinkId: { type: "none" },
      } as AudioContextOptions);
      await context.resume();
      const oscillator = context.createOscillator(),
        gain = context.createGain(),
        destination = context.createMediaStreamDestination();
      oscillator.frequency.value = 440;
      gain.gain.value = 0.2;
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();
      const stream = destination.stream;
      const track = stream.getAudioTracks()[0],
        stop = track.stop.bind(track);
      track.stop = () => {
        stop();
        oscillator.stop();
        void context.close().catch(() => undefined);
      };
      globals.voiceTestTracks.push(...stream.getTracks());
      return stream;
    };
  }, auth.token);
  return auth;
}
async function energy(page: Page, index = 0) {
  return page.evaluate(async (index) => {
    const audio = document
      .querySelectorAll<HTMLAudioElement>("audio[data-voice-peer]")
      .item(index);
    if (!(audio?.srcObject instanceof MediaStream)) return 0;
    const context = new AudioContext({
      sinkId: { type: "none" },
    } as AudioContextOptions);
    await context.resume();
    const source = context.createMediaStreamSource(audio.srcObject),
      analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let peak = 0;
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      analyser.getFloatTimeDomainData(samples);
      peak = Math.max(
        peak,
        Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length),
      );
    }
    source.disconnect();
    await context.close();
    return peak;
  }, index);
}
test("real room audio is muted by default, travels both ways, survives auction start and reconnect, and stops on moderation", async ({
  browser,
  baseURL,
}) => {
  const first = await browser.newContext({
      baseURL,
      permissions: ["microphone"],
    }),
    second = await browser.newContext({ baseURL, permissions: ["microphone"] });
  const pages: Page[] = [];
  try {
    const hostAuth = await account(first, "VoiceHost"),
      guestAuth = await account(second, "VoiceGuest");
    const catalog = (await loadCatalog()).datasets.find(
      (dataset) => dataset.id === "ipl",
    )!;
    for (const context of [first, second])
      await context.route("**/api/leagues/ipl", (route) =>
        route.fulfill({ json: catalog }),
      );
    const response = await first.request.post("/api/rooms", {
      headers: { Authorization: `Bearer ${hostAuth.token}` },
      data: {
        name: "Real voice acceptance",
        datasetId: "ipl",
        teamId: catalog.teams[0].id,
        visibility: "private",
        maxTeams: 2,
        budget: 10000,
        squadSize: 3,
        overseasCap: 3,
        timerSeconds: 120,
        increment: 10,
        reserveBudget: false,
        voice: false,
      },
    });
    expect(response.ok()).toBe(true);
    const room = await response.json();
    expect(
      (
        await second.request.post(`/api/rooms/${room.id}/join`, {
          headers: { Authorization: `Bearer ${guestAuth.token}` },
          data: { teamId: catalog.teams[1].id },
        })
      ).ok(),
    ).toBe(true);
    const host = await first.newPage(),
      guest = await second.newPage();
    pages.push(host, guest);
    await host.goto(`/rooms/${room.id}/lobby`);
    await guest.goto(`/rooms/${room.id}/lobby`);
    await host
      .getByRole("button", { name: "Enable voice chat", exact: true })
      .click();
    await host.getByRole("button", { name: "Join voice", exact: true }).click();
    await guest
      .getByRole("button", { name: "Join voice", exact: true })
      .click();
    for (const page of [host, guest]) {
      await expect(page.locator(".voice-participants > div")).toHaveCount(2);
      await expect(page.locator(".voice-participants")).not.toContainText(
        "Connecting",
      );
      await expect(
        page.getByRole("button", { name: "Unmute", exact: true }),
      ).toBeEnabled();
      expect(
        await page.evaluate(() => (window as any).voiceTestTracks.length),
      ).toBe(0);
    }
    await guest.evaluate(() => {
      (window as any).voiceTestDeny = true;
    });
    await guest.getByRole("button", { name: "Unmute", exact: true }).click();
    await expect(guest.locator(".voice [role=alert]")).toContainText(
      "permission was denied",
    );
    await expect(
      guest.getByRole("button", { name: "Leave voice" }),
    ).toBeVisible();
    await guest.evaluate(() => {
      (window as any).voiceTestDeny = false;
    });
    await host.getByRole("button", { name: "Unmute", exact: true }).click();
    await expect(
      host.getByRole("button", { name: "Mute", exact: true }),
    ).toBeEnabled();
    await guest.getByRole("button", { name: "Unmute", exact: true }).click();
    await expect(
      guest.getByRole("button", { name: "Mute", exact: true }),
    ).toBeEnabled();
    for (const page of [host, guest])
      console.log(
        "voice diagnostics",
        JSON.stringify(
          await page.evaluate(async () => {
            const globals = window as any;
            const pcs = await Promise.all(
              globals.voiceTestConnections.map(
                async (pc: RTCPeerConnection) => ({
                  state: pc.connectionState,
                  transceivers: pc.getTransceivers().map((t) => ({
                    direction: t.direction,
                    current: t.currentDirection,
                    sender: t.sender.track?.readyState,
                    enabled: t.sender.track?.enabled,
                    receiver: t.receiver.track.readyState,
                  })),
                  stats: [...(await pc.getStats()).values()]
                    .filter((s: any) =>
                      ["inbound-rtp", "outbound-rtp", "media-source"].includes(
                        s.type,
                      ),
                    )
                    .map((s: any) => ({
                      type: s.type,
                      bytesReceived: s.bytesReceived,
                      bytesSent: s.bytesSent,
                      totalAudioEnergy: s.totalAudioEnergy,
                      audioLevel: s.audioLevel,
                    })),
                }),
              ),
            );
            const audio = [
              ...document.querySelectorAll<HTMLAudioElement>(
                "audio[data-voice-peer]",
              ),
            ].map((a) => ({
              muted: a.muted,
              paused: a.paused,
              state: a.readyState,
              tracks: (a.srcObject as MediaStream)
                .getTracks()
                .map((t) => ({ ready: t.readyState, muted: t.muted })),
            }));
            return {
              pcs,
              audio,
              tracks: globals.voiceTestTracks.map((t: MediaStreamTrack) => ({
                enabled: t.enabled,
                state: t.readyState,
                muted: t.muted,
              })),
            };
          }),
        ),
      );

    await expect
      .poll(() => energy(host), { timeout: 15000 })
      .toBeGreaterThan(0.01);
    await expect
      .poll(() => energy(guest), { timeout: 15000 })
      .toBeGreaterThan(0.01);
    await expect(
      host.locator(".voice-participants .is-speaking"),
    ).not.toHaveCount(0);
    await host.getByRole("button", { name: "Deafen incoming audio" }).click();
    expect(
      await host
        .locator("audio[data-voice-peer]")
        .evaluate((audio) => (audio as HTMLAudioElement).muted),
    ).toBe(true);
    await host.getByRole("button", { name: "Enable incoming audio" }).click();
    await guest.getByRole("button", { name: "Mute", exact: true }).click();
    expect(
      await guest.evaluate(() =>
        (window as any).voiceTestTracks.every(
          (track: MediaStreamTrack) => track.readyState === "ended",
        ),
      ),
    ).toBe(true);
    await expect.poll(() => energy(host)).toBeLessThan(0.005);
    await host.getByRole("button", { name: "I’m ready" }).click();
    await guest.getByRole("button", { name: "I’m ready" }).click();
    await host.getByRole("button", { name: "Start auction" }).click();
    await expect(host).toHaveURL(/\/auction$/);
    await expect(
      host.getByRole("button", { name: "Mute", exact: true }),
    ).toBeVisible();
    await expect.poll(() => energy(guest)).toBeGreaterThan(0.01);
    await host.getByRole("button", { name: /^Bid / }).click();
    await guest.getByRole("button", { name: "Pass", exact: true }).click();
    await expect(host.locator(".my-signings")).toContainText("DEWALD BREVIS");
    await host.evaluate(async (roomId) => {
      const path = "/src/features/auction/transport.ts";
      const { closeRoom, watchRoom } = await import(path);
      closeRoom();
      setTimeout(() => watchRoom(roomId), 500);
    }, room.id);
    await expect(
      host.getByRole("button", { name: "Unmute", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(host.locator(".voice-participants > div")).toHaveCount(2);
    expect(
      await host.evaluate(() =>
        (window as any).voiceTestTracks.every(
          (track: MediaStreamTrack) => track.readyState === "ended",
        ),
      ),
    ).toBe(true);
    // An old session and an outsider cannot obtain voice access.
    const oldSession = await first.request.post(`/api/rooms/${room.id}/voice`, {
      headers: { Authorization: `Bearer ${hostAuth.token}` },
      data: { sessionId: "old-session" },
    });
    expect(oldSession.ok()).toBe(false);
    const outsiderContext = await browser.newContext({ baseURL });
    const outsider = await account(outsiderContext, "VoiceOutsider");
    const rejected = await outsiderContext.request.post(
      `/api/rooms/${room.id}/voice`,
      {
        headers: { Authorization: `Bearer ${outsider.token}` },
        data: { sessionId: "unrelated" },
      },
    );
    expect(rejected.status()).toBe(403);
    const rejectedSocket = io(`${baseURL}/voice`, {
      forceNew: true,
      reconnection: false,
      auth: { token: outsider.token, roomId: room.id, sessionId: "unrelated" },
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Voice did not reject outsider")),
        5000,
      );
      rejectedSocket.on("connect_error", () => {
        clearTimeout(timer);
        rejectedSocket.disconnect();
        resolve();
      });
    });
    await outsiderContext.close();
    expect(
      (
        await first.request.post(`/api/rooms/${room.id}/voice/remove`, {
          headers: { Authorization: `Bearer ${hostAuth.token}` },
          data: {
            userId: guestAuth.user.id,
            sessionId: await host.evaluate(async () => {
              const path = "/src/features/auction/transport.ts";
              return (await import(path)).useRoom.getState().sessionId;
            }),
          },
        })
      ).ok(),
    ).toBe(true);
    await expect(
      guest.getByRole("button", { name: "Join voice", exact: true }),
    ).toBeVisible();
    await expect(guest.locator("audio[data-voice-peer]")).toHaveCount(0);
    await expect(host.locator(".voice-participants > div")).toHaveCount(1);
    await expect(host.locator(".room-connection")).toContainText("Connected");
    await host.screenshot({ path: ".runtime/voice-auction.png" });
    await host.getByRole("button", { name: "Leave voice" }).click();
    await expect(host.locator("audio[data-voice-peer]")).toHaveCount(0);
    await expect(
      host.getByRole("button", { name: "Join voice", exact: true }),
    ).toBeVisible();
    await host.getByRole("button", { name: "Join voice", exact: true }).click();
    await host.getByRole("button", { name: "Unmute", exact: true }).click();
    await expect(
      host.getByRole("button", { name: "Mute", exact: true }),
    ).toBeEnabled();
    await host.locator(".voice-host-controls summary").click();
    await host
      .getByRole("button", { name: "Disable room voice", exact: true })
      .click();
    await expect(guest.locator(".voice")).toContainText("Voice is disabled");
    await expect(
      host.getByRole("button", { name: "Enable voice chat", exact: true }),
    ).toBeVisible();
    expect(
      await host.evaluate(() =>
        (window as any).voiceTestTracks.every(
          (track: MediaStreamTrack) => track.readyState === "ended",
        ),
      ),
    ).toBe(true);
  } catch (error) {
    for (const page of pages)
      console.log(
        "Voice failure:",
        await page
          .locator(".voice")
          .innerText()
          .catch(() => "page closed"),
      );
    throw error;
  } finally {
    await first.close();
    await second.close();
  }
});
test("three room owners exchange group audio and a leaving owner releases all microphone tracks", async ({
  browser,
  baseURL,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 3 }, () =>
      browser.newContext({ baseURL, permissions: ["microphone"] }),
    ),
  );
  try {
    const accounts = [];
    for (let i = 0; i < contexts.length; i++)
      accounts.push(await account(contexts[i], `GroupVoice${i + 1}`));
    const catalog = (await loadCatalog()).datasets.find(
      (dataset) => dataset.id === "ipl",
    )!;
    for (const context of contexts)
      await context.route("**/api/leagues/ipl", (route) =>
        route.fulfill({ json: catalog }),
      );
    const created = await contexts[0].request.post("/api/rooms", {
      headers: { Authorization: `Bearer ${accounts[0].token}` },
      data: {
        name: "Group voice acceptance",
        datasetId: "ipl",
        teamId: catalog.teams[0].id,
        maxTeams: 3,
        squadSize: 3,
        overseasCap: 3,
        voice: true,
      },
    });
    expect(created.ok()).toBe(true);
    const room = await created.json();
    for (let i = 1; i < contexts.length; i++)
      expect(
        (
          await contexts[i].request.post(`/api/rooms/${room.id}/join`, {
            headers: { Authorization: `Bearer ${accounts[i].token}` },
            data: { teamId: catalog.teams[i].id },
          })
        ).ok(),
      ).toBe(true);
    const pages = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    for (const page of pages) {
      await page.goto(`/rooms/${room.id}/lobby`);
      await page
        .getByRole("button", { name: "Join voice", exact: true })
        .click();
    }
    for (const page of pages) {
      await expect(page.locator(".voice-participants > div")).toHaveCount(3);
      await page.getByRole("button", { name: "Unmute", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Mute", exact: true }),
      ).toBeEnabled();
    }
    for (const page of pages) {
      await expect(page.locator("audio[data-voice-peer]")).toHaveCount(2);
      for (const index of [0, 1])
        await expect.poll(() => energy(page, index)).toBeGreaterThan(0.01);
    }
    await pages[0].screenshot({ path: ".runtime/voice-group.png" });
    await pages[2].getByRole("button", { name: "Leave voice" }).click();
    expect(
      await pages[2].evaluate(() =>
        (window as any).voiceTestTracks.every(
          (track: MediaStreamTrack) => track.readyState === "ended",
        ),
      ),
    ).toBe(true);
    for (const page of pages.slice(0, 2)) {
      await expect(page.locator(".voice-participants > div")).toHaveCount(2);
      await expect(page.locator("audio[data-voice-peer]")).toHaveCount(1);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
