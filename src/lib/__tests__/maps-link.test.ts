import { describe, expect, it } from "vitest";
import { MAPS_LINK_SOURCE, isMapsLink, isShortMapsLink, placeNameInMapsUrl, withScheme } from "../maps-link.ts";
import { CLIENT } from "../../worker/ui/client.ts";

describe("Maps links in the search field", () => {
  it("knows a Maps link in every form it is shared in", () => {
    for (const link of [
      "https://www.google.com/maps/place/Ichiran+Tenjin/@33.59,130.40,17z",
      "https://google.co.jp/maps/place/Ohori+Park",
      "http://maps.google.com/?q=Ohori+Park",
      "https://maps.app.goo.gl/AbC123xyz",
      "https://goo.gl/maps/AbC123",
      "www.google.com/maps/search/?api=1&query=Nara+Park",
      "  maps.app.goo.gl/AbC123  ",
    ]) expect(isMapsLink(link), link).toBe(true);
  });

  it("leaves every other query to search", () => {
    for (const query of ["ramen", "google maps", "https://example.com/maps/place/x", "https://www.google.com/search?q=ramen", "mapsgoogle.com"]) {
      expect(isMapsLink(query), query).toBe(false);
    }
  });

  it("reads the place out of the path, or out of q or query", () => {
    expect(placeNameInMapsUrl("https://www.google.com/maps/place/Ichiran+Tenjin/@33.59,130.40,17z")).toBe("Ichiran Tenjin");
    expect(placeNameInMapsUrl("https://www.google.com/maps/place/Caf%C3%A9+Ro%C3%A9/data=x")).toBe("Café Roé");
    expect(placeNameInMapsUrl("maps.google.com/?q=Ohori+Park")).toBe("Ohori Park");
    expect(placeNameInMapsUrl("https://www.google.com/maps/search/?api=1&query=Nara%20Park")).toBe("Nara Park");
    expect(placeNameInMapsUrl("https://www.google.com/maps/@33.59,130.40,15z")).toBeNull();
  });

  it("follows only the short forms, with a scheme on", () => {
    expect(isShortMapsLink("maps.app.goo.gl/AbC")).toBe(true);
    expect(isShortMapsLink("https://www.google.com/maps/place/x")).toBe(false);
    expect(withScheme("maps.app.goo.gl/AbC")).toBe("https://maps.app.goo.gl/AbC");
    expect(withScheme("http://x.y")).toBe("http://x.y");
  });

  it("is the same test in the browser, which has no bundler to import it through", () => {
    const copy = /\nconst MAPS_LINK = \/(.+)\/i;\n/.exec(CLIENT);
    expect(copy?.[1]).toBe(MAPS_LINK_SOURCE);
  });
});
