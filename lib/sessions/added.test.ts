import { describe, expect, it } from "vitest";
import { addedSentence, addedToast, joinNames, readAdded, toOffer, withAdded, withoutAdded, type AddedExercise } from "./added";

const e = (exerciseId: string, name = exerciseId, aweId = `awe-${exerciseId}`): AddedExercise => ({ exerciseId, name, aweId });

describe("the card's line", () => {
  it("one, two and three names", () => {
    expect(addedSentence(["Cable Row"])).toBe("Last time you added Cable Row.");
    expect(addedSentence(["Cable Row", "Face Pulls"])).toBe("Last time you added Cable Row and Face Pulls.");
    expect(addedSentence(["Cable Row", "Face Pulls", "Plank"])).toBe("Last time you added Cable Row, Face Pulls and Plank.");
  });
  it("joins names with commas and a final and", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["A", "B", "C", "D"])).toBe("A, B, C and D");
  });
});

describe("what to offer", () => {
  it("leaves out what today's workout has already", () => {
    expect(toOffer([e("row"), e("pulls")], ["bench", "row"]).map((x) => x.exerciseId)).toEqual(["pulls"]);
  });
  it("offers each exercise once, in the order they were added", () => {
    expect(toOffer([e("pulls"), e("row"), e("pulls", "Face Pulls", "awe-2")], []).map((x) => x.exerciseId)).toEqual(["pulls", "row"]);
  });
  it("nothing when everything is in already, or nothing was added", () => {
    expect(toOffer([e("row")], ["row"])).toEqual([]);
    expect(toOffer([], ["row"])).toEqual([]);
  });
});

describe("the stored list", () => {
  it("reads only well-formed entries", () => {
    expect(readAdded(null)).toEqual([]);
    expect(readAdded({})).toEqual([]);
    expect(readAdded([e("row"), { exerciseId: 1 }, null, "x", { exerciseId: "a", name: "A" }])).toEqual([e("row")]);
    expect(readAdded([{ ...e("row"), prescribedSets: [{ setNumber: 1 }] }])[0].prescribedSets).toEqual([{ setNumber: 1 }]);
  });
  it("adding is idempotent: the same row or the same exercise is there once", () => {
    const one = withAdded([], e("row"));
    expect(withAdded(one, e("row"))).toEqual(one);
    expect(withAdded(one, e("row", "Cable Row", "awe-other"))).toEqual([e("row", "Cable Row", "awe-other")]);
    expect(withAdded(one, e("pulls"))).toEqual([e("row"), e("pulls")]);
  });
  it("removing takes out that row only", () => {
    expect(withoutAdded([e("row"), e("pulls")], "awe-row")).toEqual([e("pulls")]);
    expect(withoutAdded([e("row")], "awe-nope")).toEqual([e("row")]);
  });
});

describe("the toast", () => {
  it("says where they went", () => {
    expect(addedToast({ today: 2, laterWorkouts: 0 })).toBe("Added to today");
    expect(addedToast({ today: 2, laterWorkouts: 1 })).toBe("Added to today and 1 later workout");
    expect(addedToast({ today: 1, laterWorkouts: 10 })).toBe("Added to today and 10 later workouts");
    expect(addedToast({ today: 0, laterWorkouts: 3 })).toBe("Added to 3 later workouts");
  });
});
