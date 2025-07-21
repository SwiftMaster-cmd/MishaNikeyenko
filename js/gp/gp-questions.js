const staticQuestions = [
  {
    id:      "numLines",
    label:   "How many lines do you need on your account?",
    type:    "number",
    weight:  15
  },
  {
    id:      "carrier",
    label:   "What carrier are you with right now?",
    type:    "select",
    weight:  14,
    options: [
      "Verizon", "AT&T", "T-Mobile", "US Cellular", "Cricket", "Metro", "Boost", "Straight Talk", "Tracfone", "Other"
    ]
  },
  {
    id:      "monthlySpend",
    label:   "What do you usually pay each month for phone service?",
    type:    "number",
    weight:  13
  },
  {
    id:      "deviceStatus",
    label:   "Is your phone paid off, or do you still owe on it?",
    type:    "select",
    weight:  12,
    options: ["Paid Off", "Still Owe", "Lease", "Mixed", "Not Sure"]
  },
  {
    id:      "upgradeInterest",
    label:   "Are you looking to upgrade your phone, or keep what you have?",
    type:    "select",
    weight:  11,
    options: ["Upgrade", "Keep Current", "Not Sure"]
  },
  {
    id:      "otherDevices",
    label:   "Do you have any other devices--tablets, smartwatches, or hotspots?",
    type:    "select",
    weight:  10,
    options: ["Tablet", "Smartwatch", "Hotspot", "Multiple", "None"]
  },
  {
    id:      "coverage",
    label:   "How’s your coverage at home and at work?",
    type:    "select",
    weight:  9,
    options: ["Great", "Good", "Average", "Poor", "Not Sure"]
  },
  {
    id:      "travel",
    label:   "Do you travel out of state or internationally?",
    type:    "select",
    weight:  8,
    options: ["Yes, both", "Just out of state", "International", "Rarely", "Never"]
  },
  {
    id:      "hotspot",
    label:   "Do you use your phone as a hotspot?",
    type:    "select",
    weight:  7,
    options: ["Yes, often", "Sometimes", "Rarely", "Never"]
  },
  {
    id:      "usage",
    label:   "How do you mainly use your phone? (Streaming, gaming, social, work, calls/texts)",
    type:    "text",
    weight:  6
  },
  {
    id:      "discounts",
    label:   "Anyone on your plan get discounts? (Military, student, senior, first responder)",
    type:    "select",
    weight:  5,
    options: ["Military", "Student", "Senior", "First Responder", "No", "Not Sure"]
  },
  {
    id:      "keepNumber",
    label:   "Do you want to keep your current number(s) if you switch?",
    type:    "select",
    weight:  5,
    options: ["Yes", "No", "Not Sure"]
  },
  {
    id:      "issues",
    label:   "Have you had any issues with dropped calls or slow data?",
    type:    "select",
    weight:  4,
    options: ["Yes", "No", "Sometimes"]
  },
  {
    id:      "planPriority",
    label:   "What’s most important to you in a phone plan? (Price, coverage, upgrades, service)",
    type:    "text",
    weight:  3
  },
  {
    id:      "promos",
    label:   "Would you like to see your options for lower monthly cost or free device promos?",
    type:    "select",
    weight:  2,
    options: ["Yes", "No", "Maybe"]
  }
];