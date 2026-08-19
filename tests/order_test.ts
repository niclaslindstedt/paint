// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { moveInOrder, orderById } from "../src/app/order.ts";

// The two things done to a stored order, and the reason they are one module:
// the toolbar, a canvas preset's kit and the right-hand panel's sections are all
// arrangements the user made in a build that shipped a particular set of things,
// read back by a build that may ship another.

describe("moveInOrder", () => {
  it("walks an id up and down the list", () => {
    expect(moveInOrder(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveInOrder(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("leaves the order alone for a move off the ends", () => {
    expect(moveInOrder(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(moveInOrder(["a", "b"], -1, 0)).toEqual(["a", "b"]);
    expect(moveInOrder(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

describe("orderById", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("lays the named ids out in the order given", () => {
    expect(orderById(items, ["c", "b", "a"]).map((i) => i.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("keeps the registered order when nothing is said", () => {
    expect(orderById(items, []).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves an unnamed item where it already was", () => {
    // "b" is not in the order, so it keeps slot 1 and the two that are named
    // fill the slots around it. Appending it would drag a thing a later release
    // added to the end of every list that had never heard of it.
    expect(orderById(items, ["c", "a"]).map((i) => i.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("ignores an id this build doesn't have, and one named twice", () => {
    expect(orderById(items, ["c", "gone", "c", "a"]).map((i) => i.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });
});
