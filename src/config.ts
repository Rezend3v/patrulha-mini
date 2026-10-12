// Tuning. Values marked (*) match the constants observed in the original game.
export const CFG = {
  W: 480,
  H: 640,
  grass: 56,            // (*) margemGrama
  shoulder: 40,         // (*) larguraAcostamento
  lanes: 3,             // (*) numFaixas
  pxPerKm: 3000,        // (*)
  dayCycle: 150,        // (*) seconds for a full day/night
  spawnEvery: [1, 1.9] as [number, number], // (*)
  irregularChance: 0.35,                     // (*)
  stopRadius: 110,      // (*) raioAbordagem
  radioEvery: [35, 70] as [number, number], // (*)
  radioAnswerSecs: 8,
  capybaraSecs: 20,
  lives: 3,             // (*)
  invuln: 1.4,          // (*)
  playerMaxSpeed: 420,
  playerAccel: 260,
  brake: 250,           // (*) freio
  lateralSpeed: 235,    // (*) velLateralSeco
  fleeSpeed: 400,       // (*) velMaxFuga
  walkSpeed: 105,       // (*) velPe
  fuelPerKm: 2.2,       // % of tank per km
  /** Difficulty reaches its maximum at this distance. */
  maxDifficultyKm: 30,
  bonusChance: 0.35,    // site claim: partner bonus question in 35% of stops
  postoEveryKm: 8,
  postoPromptSecs: 8,
  crimeChanceWhenFled: 0.65, // "quem foge tem motivo"
  buscaTries: 2,
  k9Accuracy: 0.9,
  chaseSecs: 25,
  costs: {
    life: 150,          // (*) custoVida
    fuelPerPercent: 0.8,
    k9: 120,
  },
  points: {
    busca: 5,           // (*) pontosBusca
    prisao: 24,         // (*) pontosPrisao
    bonus: 30,          // (*) pontosBravura reused for the partner's bonus question
    correct: 70,        // (*) pontosAcerto (per question)
    wrong: -40,         // (*) pontosErro
    routine: 10,        // (*) pontosRotina
    occurrence: 16,     // (*) pontosOcorrencia
    occurrenceFail: -60,
    collision: -20,
  },
};

export const roadLeft = CFG.grass;
export const roadRight = CFG.W - CFG.grass;
export const laneWidth = (roadRight - roadLeft - CFG.shoulder) / CFG.lanes;
export const laneCenter = (i: number) => roadLeft + laneWidth * (i + 0.5);
export const shoulderCenter = roadRight - CFG.shoulder / 2;
