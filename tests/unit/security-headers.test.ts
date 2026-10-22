import { describe, expect, it } from "vitest";
import {
  contentSecurityPolicy,
  PERMISSIONS_POLICY,
  securityHeaders,
} from "@/common/http/security-headers";

const directive = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.split(" ")
    .slice(1) ?? [];

describe("security headers", () => {
  it("sends the baseline headers, with the CSP as report-only", () => {
    const headers = Object.fromEntries(
      securityHeaders({ dev: false }).map((h) => [h.key, h.value]),
    );
    expect(headers).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Strict-Transport-Security": "max-age=63072000",
    });
    expect(headers["Content-Security-Policy-Report-Only"]).toBeTruthy();
    expect(headers["Content-Security-Policy"]).toBeUndefined();
  });

  it("allows the embedded stream players and the image CDNs we hotlink", () => {
    const csp = contentSecurityPolicy({ dev: false });
    expect(directive(csp, "frame-src")).toEqual(
      expect.arrayContaining([
        "https://player.twitch.tv",
        "https://www.twitch.tv",
        "https://player.kick.com",
      ]),
    );
    expect(directive(csp, "img-src")).toEqual(
      expect.arrayContaining([
        "https://cdn.cloudflare.steamstatic.com",
        "https://avatars.steamstatic.com",
        "https://*.jtvnw.net",
        "https://*.kick.com",
      ]),
    );
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "connect-src")).toEqual(["'self'"]);
  });

  it("only allows eval and websockets in development", () => {
    expect(directive(contentSecurityPolicy({ dev: false }), "script-src")).not.toContain(
      "'unsafe-eval'",
    );
    const dev = contentSecurityPolicy({ dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
  });

  it("keeps autoplay and fullscreen for the players and turns off unused hardware", () => {
    expect(PERMISSIONS_POLICY).toContain(
      'autoplay=(self "https://player.twitch.tv" "https://player.kick.com")',
    );
    expect(PERMISSIONS_POLICY).toContain(
      'fullscreen=(self "https://player.twitch.tv" "https://player.kick.com")',
    );
    for (const off of ["camera=()", "microphone=()", "geolocation=()"])
      expect(PERMISSIONS_POLICY).toContain(off);
  });
});
