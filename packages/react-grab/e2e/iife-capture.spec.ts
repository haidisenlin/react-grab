import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const directory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(directory, "../../../apps/e2e-react-grab-development/dist");
const fixtureHtml = path.join(directory, "fixtures/iife-capture.html");

const startFixtureServer = async (): Promise<{ url: string; close: () => Promise<void> }> => {
  const server = http.createServer((request, response) => {
    const requestPath = request.url?.split("?")[0];
    if (requestPath === "/index.global.js" || requestPath === "/capture.global.js") {
      response.setHeader("content-type", "text/javascript; charset=utf-8");
      createReadStream(path.join(distDirectory, requestPath.slice(1))).pipe(response);
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    createReadStream(fixtureHtml).pipe(response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("IIFE capture fixture did not bind a port");
  }
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
};

test("script-tag IIFE capture produces an overview and a crop", async ({ page }) => {
  test.setTimeout(60_000);
  const coreSource = await readFile(path.join(distDirectory, "index.global.js"), "utf8");
  const captureSource = await readFile(path.join(distDirectory, "capture.global.js"), "utf8");
  expect(coreSource).toContain('import("@zumer/snapdom")');
  expect(captureSource.length).toBeGreaterThan(coreSource.length / 10);
  expect(captureSource).toContain("snapdom");

  const fixture = await startFixtureServer();
  try {
    await page.goto(fixture.url);
    await page.waitForFunction(() => window.__REACT_GRAB__);
    await page.evaluate(() => {
      window.__REACT_GRAB__?.activate();
    });
    await page.locator("#grab-target").click({ force: true });

    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const images = await window.__REACT_GRAB__?.getSelectionImages();
            const crop = images?.crops[0];
            if (!images || !crop) return null;
            return {
              overviewPrefix: images.overview.data_url.slice(0, 22),
              overviewWidth: images.overview.pixel_width,
              overviewHeight: images.overview.pixel_height,
              cropCount: images.crops.length,
              cropWidth: crop.pixel_width,
              cropHeight: crop.pixel_height,
              annotationCount: images.annotations.length,
            };
          }),
        { timeout: 20_000 },
      )
      .toEqual(
        expect.objectContaining({
          overviewPrefix: "data:image/png;base64,",
          cropCount: 1,
          annotationCount: 1,
        }),
      );

    const summary = await page.evaluate(async () => {
      const images = await window.__REACT_GRAB__?.getSelectionImages();
      const captureScript = document.querySelector("[data-react-grab-capture]");
      return {
        overviewWidth: images?.overview.pixel_width ?? 0,
        overviewHeight: images?.overview.pixel_height ?? 0,
        cropWidth: images?.crops[0]?.pixel_width ?? 0,
        cropHeight: images?.crops[0]?.pixel_height ?? 0,
        captureSource: captureScript instanceof HTMLScriptElement ? captureScript.src : "",
      };
    });
    expect(summary.overviewWidth).toBeGreaterThan(0);
    expect(summary.overviewHeight).toBeGreaterThan(0);
    expect(summary.cropWidth).toBeGreaterThan(0);
    expect(summary.cropHeight).toBeGreaterThan(0);
    expect(summary.captureSource).toContain("/capture.global.js");
  } finally {
    await fixture.close();
  }
});
