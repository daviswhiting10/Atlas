/**
 * Curated exercise list (~115 movements).
 * Each `name` must match exactly a name in data/exercise-db-raw.json.
 * movementPattern = NASM classification.
 * coachingCues = Davis's cues; empty at launch, populated over time via UI.
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
  coachingCues?: string[];
};

export const SEED_EXERCISES: SeedEntry[] = [
  // ─── SQUAT ───────────────────────────────────────────────────────────────
  { name: "Bodyweight Squat", movementPattern: "SQUAT" },
  { name: "Freehand Jump Squat", movementPattern: "SQUAT" },
  {
    name: "Barbell Squat",
    movementPattern: "SQUAT",
    coachingCues: [
      "Brace 360° before descent — big breath, hold",
      "Knees track over mid-foot, not caving in",
      "Break parallel if mobility allows; depth is earned",
    ],
  },
  { name: "Front Barbell Squat", movementPattern: "SQUAT" },
  { name: "Box Squat", movementPattern: "SQUAT" },
  { name: "Barbell Hack Squat", movementPattern: "SQUAT" },
  { name: "Overhead Squat", movementPattern: "SQUAT" },
  { name: "Wide Stance Barbell Squat", movementPattern: "SQUAT" },
  { name: "Zercher Squats", movementPattern: "SQUAT" },
  {
    name: "Goblet Squat",
    movementPattern: "SQUAT",
    coachingCues: [
      "Elbows inside knees at bottom — use them as wedges",
      "Heel-width stance, toes slightly out",
    ],
  },
  { name: "Dumbbell Squat", movementPattern: "SQUAT" },
  { name: "Kettlebell Pistol Squat", movementPattern: "SQUAT" },

  // ─── HINGE ───────────────────────────────────────────────────────────────
  {
    name: "Barbell Deadlift",
    movementPattern: "HINGE",
    coachingCues: [
      "Bar over mid-foot — hip hinge, not squat",
      "Lat engagement before the pull: 'protect your armpits'",
      "Drive the floor away; don't think about pulling the bar up",
    ],
  },
  {
    name: "Romanian Deadlift",
    movementPattern: "HINGE",
    coachingCues: [
      "Soft knee, push hips back until hamstring tension is felt",
      "Bar stays in contact with legs the entire way down",
    ],
  },
  { name: "Sumo Deadlift", movementPattern: "HINGE" },
  { name: "Stiff-Legged Barbell Deadlift", movementPattern: "HINGE" },
  { name: "Stiff-Legged Dumbbell Deadlift", movementPattern: "HINGE" },
  { name: "Trap Bar Deadlift", movementPattern: "HINGE" },
  { name: "Kettlebell One-Legged Deadlift", movementPattern: "HINGE" },
  {
    name: "Barbell Hip Thrust",
    movementPattern: "HINGE",
    coachingCues: [
      "Chin tucked, ribs down — avoid lumbar hyperextension at the top",
      "Drive through heels, full glute squeeze at lockout",
    ],
  },
  { name: "Barbell Glute Bridge", movementPattern: "HINGE" },
  { name: "Single Leg Glute Bridge", movementPattern: "HINGE" },
  {
    name: "One-Arm Kettlebell Swings",
    movementPattern: "HINGE",
    coachingCues: [
      "Hike the bell, then explosive hip snap — arms are just ropes",
      "Stand tall at top: glutes, quads, core all locked out",
    ],
  },
  { name: "Pull Through", movementPattern: "HINGE" },

  // ─── HORIZONTAL PUSH ─────────────────────────────────────────────────────
  {
    name: "Pushups",
    movementPattern: "HORIZONTAL_PUSH",
    coachingCues: [
      "Hollow body throughout — no sagging hips or hyperextended lumbar",
      "Scapula protracts fully at top",
    ],
  },
  { name: "Push-Up Wide", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Push-Ups - Close Triceps Position", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Decline Push-Up", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Incline Push-Up", movementPattern: "HORIZONTAL_PUSH" },
  {
    name: "Barbell Bench Press - Medium Grip",
    movementPattern: "HORIZONTAL_PUSH",
    coachingCues: [
      "Retract and depress scapulae — create a stable shelf",
      "Bar path: slight arc from chest to lockout over wrists",
      "Leg drive into floor, don't bounce the chest",
    ],
  },
  { name: "Barbell Incline Bench Press - Medium Grip", movementPattern: "HORIZONTAL_PUSH" },
  {
    name: "Dumbbell Bench Press",
    movementPattern: "HORIZONTAL_PUSH",
    coachingCues: [
      "Wrists stacked over elbows throughout",
      "Greater ROM than barbell — use it if shoulder allows",
    ],
  },
  { name: "Dumbbell Bench Press with Neutral Grip", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Incline Dumbbell Press", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Dumbbell Floor Press", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Flat Bench Cable Flyes", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Low Cable Crossover", movementPattern: "HORIZONTAL_PUSH" },
  { name: "Cable Chest Press", movementPattern: "HORIZONTAL_PUSH" },
  { name: "One-Arm Kettlebell Floor Press", movementPattern: "HORIZONTAL_PUSH" },

  // ─── VERTICAL PUSH ───────────────────────────────────────────────────────
  { name: "Handstand Push-Ups", movementPattern: "VERTICAL_PUSH" },
  {
    name: "Barbell Shoulder Press",
    movementPattern: "VERTICAL_PUSH",
    coachingCues: [
      "Bar starts at clavicle; drive head through at lockout",
      "Brace hard — this is a full-body press",
    ],
  },
  { name: "Standing Military Press", movementPattern: "VERTICAL_PUSH" },
  { name: "Push Press", movementPattern: "VERTICAL_PUSH" },
  { name: "Seated Barbell Military Press", movementPattern: "VERTICAL_PUSH" },
  {
    name: "Dumbbell Shoulder Press",
    movementPattern: "VERTICAL_PUSH",
    coachingCues: [
      "Elbows slightly in front of body — not flared 90°",
      "Full lockout without shrugging at top",
    ],
  },
  { name: "Seated Dumbbell Press", movementPattern: "VERTICAL_PUSH" },
  { name: "Arnold Dumbbell Press", movementPattern: "VERTICAL_PUSH" },
  { name: "Side Lateral Raise", movementPattern: "VERTICAL_PUSH" },
  { name: "Cable Seated Lateral Raise", movementPattern: "VERTICAL_PUSH" },
  { name: "Two-Arm Kettlebell Military Press", movementPattern: "VERTICAL_PUSH" },
  { name: "One-Arm Kettlebell Push Press", movementPattern: "VERTICAL_PUSH" },

  // ─── HORIZONTAL PULL ─────────────────────────────────────────────────────
  { name: "Inverted Row", movementPattern: "HORIZONTAL_PULL" },
  {
    name: "Bent Over Barbell Row",
    movementPattern: "HORIZONTAL_PULL",
    coachingCues: [
      "Hip hinge setup — back flat, not rounding",
      "Pull to lower sternum; elbows drive back, not up",
    ],
  },
  { name: "T-Bar Row with Handle", movementPattern: "HORIZONTAL_PULL" },
  { name: "Reverse Grip Bent-Over Rows", movementPattern: "HORIZONTAL_PULL" },
  {
    name: "One-Arm Dumbbell Row",
    movementPattern: "HORIZONTAL_PULL",
    coachingCues: [
      "Allow full scapular protraction at the bottom",
      "Drive elbow to ceiling — not pulling with the bicep",
    ],
  },
  { name: "Bent Over Two-Dumbbell Row", movementPattern: "HORIZONTAL_PULL" },
  { name: "Dumbbell Incline Row", movementPattern: "HORIZONTAL_PULL" },
  { name: "Seated Bent-Over Rear Delt Raise", movementPattern: "HORIZONTAL_PULL" },
  {
    name: "Seated Cable Rows",
    movementPattern: "HORIZONTAL_PULL",
    coachingCues: [
      "Hinge slightly at hips on the stretch — earn full ROM",
      "Retract scapulae at end range; don't lean back",
    ],
  },
  {
    name: "Face Pull",
    movementPattern: "HORIZONTAL_PULL",
    coachingCues: [
      "High anchor, pull to nose/forehead, elbows flare high",
      "External rotation at end — essential for shoulder health",
    ],
  },
  { name: "Cable Rope Rear-Delt Rows", movementPattern: "HORIZONTAL_PULL" },
  { name: "Two-Arm Kettlebell Row", movementPattern: "HORIZONTAL_PULL" },

  // ─── VERTICAL PULL ───────────────────────────────────────────────────────
  {
    name: "Pullups",
    movementPattern: "VERTICAL_PULL",
    coachingCues: [
      "Dead hang → depress scapulae before initiating pull",
      "Drive elbows to hips — 'armpits to pockets'",
      "Full extension at bottom every rep",
    ],
  },
  { name: "Chin-Up", movementPattern: "VERTICAL_PULL" },
  { name: "V-Bar Pullup", movementPattern: "VERTICAL_PULL" },
  { name: "Scapular Pull-Up", movementPattern: "VERTICAL_PULL" },
  { name: "Band Assisted Pull-Up", movementPattern: "VERTICAL_PULL" },
  {
    name: "Wide-Grip Lat Pulldown",
    movementPattern: "VERTICAL_PULL",
    coachingCues: [
      "Slight lean back, pull bar to upper chest",
      "Control the ascent — don't let the stack yank you",
    ],
  },
  { name: "Close-Grip Front Lat Pulldown", movementPattern: "VERTICAL_PULL" },
  { name: "Underhand Cable Pulldowns", movementPattern: "VERTICAL_PULL" },
  { name: "Straight-Arm Pulldown", movementPattern: "VERTICAL_PULL" },
  { name: "Bent-Arm Dumbbell Pullover", movementPattern: "VERTICAL_PULL" },

  // ─── LUNGE ───────────────────────────────────────────────────────────────
  { name: "Bodyweight Walking Lunge", movementPattern: "LUNGE" },
  { name: "Barbell Walking Lunge", movementPattern: "LUNGE" },
  {
    name: "Barbell Lunge",
    movementPattern: "LUNGE",
    coachingCues: [
      "Vertical torso; front knee tracks mid-foot",
      "Step long enough that knee stays behind toes at 90°",
    ],
  },
  { name: "Dumbbell Lunges", movementPattern: "LUNGE" },
  { name: "Dumbbell Rear Lunge", movementPattern: "LUNGE" },
  { name: "Elevated Back Lunge", movementPattern: "LUNGE" },
  {
    name: "Split Squats",
    movementPattern: "LUNGE",
    coachingCues: [
      "Torso lean changes the emphasis: upright = quad, forward = glute",
      "Drive through front heel; squeeze glute at top",
    ],
  },
  { name: "Split Squat with Dumbbells", movementPattern: "LUNGE" },
  { name: "Dumbbell Step Ups", movementPattern: "LUNGE" },
  { name: "Barbell Step Ups", movementPattern: "LUNGE" },
  { name: "Crossover Reverse Lunge", movementPattern: "LUNGE" },
  { name: "Lunge Sprint", movementPattern: "LUNGE" },

  // ─── CARRY ───────────────────────────────────────────────────────────────
  {
    name: "Farmer's Walk",
    movementPattern: "CARRY",
    coachingCues: [
      "Tall spine, shoulders packed — walk with purpose",
      "Short quick steps; don't let the weight pull you laterally",
    ],
  },
  { name: "Rickshaw Carry", movementPattern: "CARRY" },
  { name: "Bear Crawl Sled Drags", movementPattern: "CARRY" },

  // ─── ROTATION ────────────────────────────────────────────────────────────
  { name: "Russian Twist", movementPattern: "ROTATION" },
  { name: "Cable Russian Twists", movementPattern: "ROTATION" },
  {
    name: "Standing Cable Wood Chop",
    movementPattern: "ROTATION",
    coachingCues: [
      "Power from hips rotating — arms are just the lever",
      "Tall posture throughout; don't collapse at end range",
    ],
  },
  { name: "Standing Cable Lift", movementPattern: "ROTATION" },
  {
    name: "Kettlebell Windmill",
    movementPattern: "ROTATION",
    coachingCues: [
      "Push hips toward the side of the working arm",
      "Eyes on the bell the whole movement",
    ],
  },
  { name: "Advanced Kettlebell Windmill", movementPattern: "ROTATION" },
  { name: "Torso Rotation", movementPattern: "ROTATION" },
  { name: "Backward Medicine Ball Throw", movementPattern: "ROTATION" },

  // ─── ANTI-ROTATION ───────────────────────────────────────────────────────
  {
    name: "Plank",
    movementPattern: "ANTI_ROTATION",
    coachingCues: [
      "Hollow body: ribs down, glutes squeezed, no hip sag",
      "Push the floor away — active shoulder depression",
    ],
  },
  { name: "Push Up to Side Plank", movementPattern: "ANTI_ROTATION" },
  {
    name: "Dead Bug",
    movementPattern: "ANTI_ROTATION",
    coachingCues: [
      "Low back pressed flat into floor throughout",
      "Exhale with each extension — diaphragmatic bracing",
    ],
  },
  {
    name: "Pallof Press",
    movementPattern: "ANTI_ROTATION",
    coachingCues: [
      "Cable perpendicular — resist rotation, don't fight it with brute force",
      "Press slowly, hold 1 second at full extension",
    ],
  },
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
