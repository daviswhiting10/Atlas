import { describe, expect, it } from "vitest";
import { _match, pictureFor } from "./pictures";

describe("exercise pictures", () => {
  it("reads a coach's shorthand and labels", () => {
    expect(_match("1A Goblet Box Squat")).toBe("Goblet Squat");
    expect(_match("db rdl")).toBe("Romanian Deadlift");
    expect(_match("BB RDL")).toBe("Romanian Deadlift");
    expect(_match("hexbar deadlift")).toBe("Trap Bar Deadlift");
    expect(_match("3A One-Arm Dumbbell Row")).toBe("One-Arm Dumbbell Row");
    expect(_match("Farm carry")).toBe("Farmer's Walk");
    expect(_match("Glue bridge")).toBe("Single Leg Glute Bridge");
    expect(_match("Lying Hamstring Curl")).toBe("Lying Leg Curls");
    expect(_match("Recumbent bike")).toBe("Recumbent Bike");
  });

  it("would rather show nothing than the wrong exercise", () => {
    expect(_match("Landmine squat")).toBeNull();
    expect(_match("Spanish Squat (band around rack)")).toBeNull();
    expect(_match("Hinge")).toBeNull();
    expect(_match("Bird Dog")).toBeNull();
    // Near misses the coach ruled out.
    expect(_match("GHD Hamstring Curl (or Nordic)")).toBeNull();
    expect(_match("Prone Partner Hamstring Curl")).toBeNull();
    expect(_match("Suitcase carry")).toBeNull();
    expect(_match("Landmine Staggered (Kickstand) RDL")).toBeNull();
    expect(_match("Standing 1-Arm Cable / Band Row")).toBeNull();
    // ...and ones they kept.
    expect(_match("Dumbbell Hip Thrust")).toBe("Barbell Hip Thrust");
    expect(_match("Row or Bike Intervals")).toBe("Bicycling, Stationary");
    // The library's "Air Bike" is a bicycle crunch.
    expect(_match("Assault Bike")).not.toBe("Air Bike");
  });

  it("uses a stored library link, served from the CDN, with both frames", () => {
    const p = pictureFor({ name: "Jump squat", gifUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Freehand_Jump_Squat/0.jpg" });
    expect(p?.frames).toEqual([
      "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Freehand_Jump_Squat/0.jpg",
      "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Freehand_Jump_Squat/1.jpg",
    ]);
  });
});
