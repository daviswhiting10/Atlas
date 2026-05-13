/**
 * Curated exercise list (~110 movements).
 * Each `name` must match exactly a name in data/exercise-db-raw.json.
 * movementPattern = NASM classification.
 * coachingCues populated organically via UI once trainer-side exercise editing ships.
 */

export type MovementPattern =
  | "SQUAT"
  | "HINGE"
  | "HORIZONTAL_PUSH"
  | "VERTICAL_PUSH"
  | "HORIZONTAL_PULL"
  | "VERTICAL_PULL"
  | "LUNGE"
  | "CARRY"
  | "ROTATION"
  | "ANTI_ROTATION"
  | "LOCOMOTION";

export type SeedEntry = {
  name: string;
  movementPattern: MovementPattern;
};

export const SEED_EXERCISES: SeedEntry[] = [
  // ─── SQUAT ───────────────────────────────────────────────────────────────
  { name: "Bodyweight Squat", movementPattern: "SQUAT" },
  { name: "Freehand Jump Squat", movementPattern: "SQUAT" },
  { name: "Barbell Squat", movementPattern: "SQUAT" },
  { name: "Front Barbell Squat", movementPattern: "SQUAT" },
  { name: "Box Squat", movementPattern: "SQUAT" },
  { name: "Barbell Hack Squat", movementPattern: "SQUAT" },
  { name: "Hack Squat", movementPattern: "SQUAT" },
  { name: "Overhead Squat", movementPattern: "SQUAT" },
  { name: "Wide Stance Barbell Squat", movementPattern: "SQUAT" },
  { name: "Zercher Squats", movementPattern: "SQUAT" },
  { name: "Goblet Squat", movementPattern: "SQUAT" },
  { name: "Dumbbell Squat", movementPattern: "SQUAT" },
  { name: "Kettlebell Pistol Squat", movementPattern: "SQUAT" },

  // ─── HINGE ───────────────────────────────────────────────────────────────
  { name: "Barbell Deadlift", movementPattern: "HINGE" },
  { name: "Romanian Deadlift", movementPattern: "HINGE" },
  { name: "Sumo Deadlift", movementPattern: "HINGE" },
  { name: "Stiff-Legged Barbell Deadlift", movementPattern: "HINGE" },
  { name: "Stiff-Legged Dumbbell Deadlift", movementPattern: "HINGE" },
  { name: "Trap Bar Deadlift", movementPattern: "HINGE" },
  { name: "Kettlebell One-Legged Deadlift", movementPattern: "HINGE" },
  { name: "Barbell Hip Thrust", movementPattern: "HINGE" },
  { name: "Barbell Glute Bridge", movementPattern: "HINGE" },
  { name: "Single Leg Glute Bridge", movementPattern: "HINGE" },
  { name: "One-Arm Kettlebell Swings", movementPattern: "HINGE" },
  { name: "Good Morning", movementPattern: "HINGE" },
  { name: "Pull Through", movementPattern: "HINGE" },

  // ─── HORIZONTAL PUSH ─────────────────────────────────────────────────────
  { name: "Pushups", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Push-Up Wide", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Push-Ups - Close Triceps Position", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Decline Push-Up", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Incline Push-Up", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Barbell Bench Press - Medium Grip", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Barbell Incline Bench Press - Medium Grip", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Dumbbell Bench Press", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Dumbbell Bench Press with Neutral Grip", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Incline Dumbbell Press", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Dumbbell Floor Press", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Flat Bench Cable Flyes", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Low Cable Crossover", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Cable Chest Press", movementPattern: "HORIZONTAL_PUSH" },
  { name: "One-Arm Kettlebell Floor Press", movementPattern: "HORIZONTAL_PUSH" },

  // ─── VERTICAL PUSH ───────────────────────────────────────────────────────
  { name: "Handstand Push-Ups", movementPattern: "VERTICAL_PUSH" },
  { name: "Barbell Shoulder Press", movementPattern: "VERTICAL_PUSH" },
  { name: "Standing Military Press", movementPattern: "VERTICAL_PUSH" },
  { name: "Push Press", movementPattern: "VERTICAL_PUSH" },
  { name: "Seated Barbell Military Press", movementPattern: "VERTICAL_PUSH" },
  { name: "Dumbbell Shoulder Press", movementPattern: "VERTICAL_PUSH" },
  { name: "Seated Dumbbell Press", movementPattern: "VERTICAL_PUSH" },
  { name: "Arnold Dumbbell Press", movementPattern: "VERTICAL_PUSH" },
  { name: "Side Lateral Raise", movementPattern: "VERTICAL_PUSH" },
  { name: "Cable Seated Lateral Raise", movementPattern: "VERTICAL_PUSH" },
  { name: "Two-Arm Kettlebell Military Press", movementPattern: "VERTICAL_PUSH" },
  { name: "One-Arm Kettlebell Push Press", movementPattern: "VERTICAL_PUSH" },

  // ─── HORIZONTAL PULL ─────────────────────────────────────────────────────
  { name: "Inverted Row", movementPattern: "HORIZONTAL_PULL" },
  { name: "Bent Over Barbell Row", movementPattern: "HORIZONTAL_PULL" },
  { name: "T-Bar Row with Handle", movementPattern: "HORIZONTAL_PULL" },
  { name: "Reverse Grip Bent-Over Rows", movementPattern: "HORIZONTAL_PULL" },
  { name: "One-Arm Dumbbell Row", movementPattern: "HORIZONTAL_PULL" },
  { name: "Bent Over Two-Dumbbell Row", movementPattern: "HORIZONTAL_PULL" },
  { name: "Dumbbell Incline Row", movementPattern: "HORIZONTAL_PULL" },
  { name: "Seated Bent-Over Rear Delt Raise", movementPattern: "HORIZONTAL_PULL" },
  { name: "Seated Cable Rows", movementPattern: "HORIZONTAL_PULL" },
  { name: "Face Pull", movementPattern: "HORIZONTAL_PULL" },
  { name: "Cable Rope Rear-Delt Rows", movementPattern: "HORIZONTAL_PULL" },
  { name: "Two-Arm Kettlebell Row", movementPattern: "HORIZONTAL_PULL" },

  // ─── VERTICAL PULL ───────────────────────────────────────────────────────
  { name: "Pullups", movementPattern: "VERTICAL_PULL" },
  { name: "Chin-Up", movementPattern: "VERTICAL_PULL" },
  { name: "V-Bar Pullup", movementPattern: "VERTICAL_PULL" },
  { name: "Scapular Pull-Up", movementPattern: "VERTICAL_PULL" },
  { name: "Band Assisted Pull-Up", movementPattern: "VERTICAL_PULL" },
  { name: "Wide-Grip Lat Pulldown", movementPattern: "VERTICAL_PULL" },
  { name: "Close-Grip Front Lat Pulldown", movementPattern: "VERTICAL_PULL" },
  { name: "Underhand Cable Pulldowns", movementPattern: "VERTICAL_PULL" },
  { name: "Straight-Arm Pulldown", movementPattern: "VERTICAL_PULL" },
  { name: "Bent-Arm Dumbbell Pullover", movementPattern: "VERTICAL_PULL" },

  // ─── LUNGE ───────────────────────────────────────────────────────────────
  { name: "Bodyweight Walking Lunge", movementPattern: "LUNGE" },
  { name: "Barbell Walking Lunge", movementPattern: "LUNGE" },
  { name: "Barbell Lunge", movementPattern: "LUNGE" },
  { name: "Dumbbell Lunges", movementPattern: "LUNGE" },
  { name: "Dumbbell Rear Lunge", movementPattern: "LUNGE" },
  { name: "Elevated Back Lunge", movementPattern: "LUNGE" },
  { name: "Split Squats", movementPattern: "LUNGE" },
  { name: "Split Squat with Dumbbells", movementPattern: "LUNGE" },
  { name: "Dumbbell Step Ups", movementPattern: "LUNGE" },
  { name: "Barbell Step Ups", movementPattern: "LUNGE" },
  { name: "Crossover Reverse Lunge", movementPattern: "LUNGE" },
  { name: "Lunge Sprint", movementPattern: "LUNGE" },

  // ─── CARRY ───────────────────────────────────────────────────────────────
  { name: "Farmer's Walk", movementPattern: "CARRY" },
  { name: "Rickshaw Carry", movementPattern: "CARRY" },
  { name: "Bear Crawl Sled Drags", movementPattern: "CARRY" },

  // ─── ROTATION ────────────────────────────────────────────────────────────
  { name: "Russian Twist", movementPattern: "ROTATION" },
  { name: "Cable Russian Twists", movementPattern: "ROTATION" },
  { name: "Standing Cable Wood Chop", movementPattern: "ROTATION" },
  { name: "Standing Cable Lift", movementPattern: "ROTATION" },
  { name: "Kettlebell Windmill", movementPattern: "ROTATION" },
  { name: "Advanced Kettlebell Windmill", movementPattern: "ROTATION" },
  { name: "Torso Rotation", movementPattern: "ROTATION" },
  { name: "Backward Medicine Ball Throw", movementPattern: "ROTATION" },

  // ─── ANTI-ROTATION ───────────────────────────────────────────────────────
  { name: "Plank", movementPattern: "ANTI_ROTATION" },
  { name: "Push Up to Side Plank", movementPattern: "ANTI_ROTATION" },
  { name: "Dead Bug", movementPattern: "ANTI_ROTATION" },
  { name: "Pallof Press", movementPattern: "ANTI_ROTATION" },
  { name: "Pallof Press With Rotation", movementPattern: "ANTI_ROTATION" },
  { name: "Barbell Ab Rollout", movementPattern: "ANTI_ROTATION" },
  { name: "Barbell Ab Rollout - On Knees", movementPattern: "ANTI_ROTATION" },

  // ─── LOCOMOTION ──────────────────────────────────────────────────────────
  { name: "Box Jump (Multiple Response)", movementPattern: "LOCOMOTION" },
  { name: "Front Box Jump", movementPattern: "LOCOMOTION" },
  { name: "Sled Push", movementPattern: "LOCOMOTION" },
  { name: "Sled Row", movementPattern: "LOCOMOTION" },
  { name: "Prowler Sprint", movementPattern: "LOCOMOTION" },
  { name: "One-Arm Kettlebell Clean", movementPattern: "LOCOMOTION" },
  { name: "Two-Arm Kettlebell Jerk", movementPattern: "LOCOMOTION" },
];
