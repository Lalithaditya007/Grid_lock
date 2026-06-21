// mlModel.js — Ensemble of 3 brain.js neural networks
// 12-feature input · proper NULL imputation · 80/20 holdout · R², MAE, RMSE metrics

// ─── Module state ──────────────────────────────────────────────────────────────
let ensembleState = null;   // { models, featureMeta, metrics }

// ─── Feature schema (12 features) ─────────────────────────────────────────────
export const FEATURE_KEYS = [
  'hour', 'dayOfWeek', 'month', 'isWeekend', 'isPeakHour',
  'zoneFreq', 'causeFreq', 'hasClosure', 'isHighPriority',
  'isPlanned', 'durationNorm', 'junctionDensity',
];

export const FEATURE_LABELS = {
  hour:           'Hour of Day',
  dayOfWeek:      'Day of Week',
  month:          'Month',
  isWeekend:      'Is Weekend',
  isPeakHour:     'Peak Hour (7-10, 17-20)',
  zoneFreq:       'Zone Incident Density',
  causeFreq:      'Cause Recurrence Rate',
  hasClosure:     'Road Closure',
  isHighPriority: 'High Priority',
  isPlanned:      'Planned Event',
  durationNorm:   'Event Duration',
  junctionDensity:'Junction Hotspot Score',
};

// ─── 1. Feature metadata from full dataset (NULL-aware) ────────────────────────
export function buildFeatureMeta(events) {
  // Median duration — for imputing null duration_hours
  const durations = events
    .filter(e => e.duration_hours != null && e.duration_hours > 0)
    .map(e => e.duration_hours)
    .sort((a, b) => a - b);
  const medianDuration = durations.length
    ? durations[Math.floor(durations.length / 2)]
    : 2.0;   // fallback: 2 hours

  // Frequency counts (raw, unnormalised)
  const zoneCount = {};
  const causeCount = {};
  const junctionCount = {};

  events.forEach(e => {
    const z = e.zone     || 'Unknown';
    const c = e.event_cause || 'others';
    const j = e.junction || '';
    zoneCount[z]     = (zoneCount[z]     || 0) + 1;
    causeCount[c]    = (causeCount[c]    || 0) + 1;
    if (j) junctionCount[j] = (junctionCount[j] || 0) + 1;
  });

  const maxZone     = Math.max(...Object.values(zoneCount),     1);
  const maxCause    = Math.max(...Object.values(causeCount),    1);
  const maxJunction = Math.max(...Object.values(junctionCount), 1);

  return {
    medianDuration,
    zoneCount, causeCount, junctionCount,
    maxZone, maxCause, maxJunction,
  };
}

// ─── 2. Build one feature vector from an event (handles all NULLs) ─────────────
function featurize(e, meta) {
  const { medianDuration, zoneCount, causeCount, junctionCount,
          maxZone, maxCause, maxJunction } = meta;

  // Temporal — NULL start_datetime → default to weekday 9am June
  const dt = e.start_datetime;
  const hour    = dt ? dt.getHours()  : 9;
  const dow     = dt ? dt.getDay()    : 2;   // Tuesday
  const month   = dt ? dt.getMonth()  : 5;   // June

  const isWeekend  = (dow === 0 || dow === 6) ? 1 : 0;
  const isPeakHour = ((hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20)) ? 1 : 0;

  // Categorical — frequency encoding (normalized to 0-1)
  const zone     = e.zone        || 'Unknown';
  const cause    = e.event_cause || 'others';
  const junction = e.junction    || '';

  const zoneFreq     = (zoneCount[zone]          || 0) / maxZone;
  const causeFreq    = (causeCount[cause]         || 0) / maxCause;
  const junctionDensity = junction
    ? (junctionCount[junction] || 0) / maxJunction
    : 0;

  // Duration — NULL → median imputation, then normalize (cap at 72h)
  const dur  = (e.duration_hours != null && e.duration_hours > 0)
    ? e.duration_hours : medianDuration;
  const durationNorm = Math.min(dur / 72, 1);

  // Binary flags
  const hasClosure    = e.requires_road_closure ? 1 : 0;
  const isHighPriority = e.priority === 'High'   ? 1 : 0;
  const isPlanned     = e.event_type === 'planned' ? 1 : 0;

  return {
    hour:           hour / 23,
    dayOfWeek:      dow  / 6,
    month:          month / 11,
    isWeekend,
    isPeakHour,
    zoneFreq,
    causeFreq,
    hasClosure,
    isHighPriority,
    isPlanned,
    durationNorm,
    junctionDensity,
  };
}

// ─── 3. Impact target — enhanced formula (uses featurize meta) ────────────────
function computeTarget(e, meta, stats) {
  const dur = (e.duration_hours != null && e.duration_hours > 0)
    ? e.duration_hours : meta.medianDuration;

  const zone  = e.zone        || 'Unknown';
  const cause = e.event_cause || 'others';

  const durScore      = Math.min((dur / 48) * 35, 35);          // 0-35 pts
  const closureScore  = e.requires_road_closure ? 25 : 0;       // 0-25 pts
  const priorityScore = e.priority === 'High'   ? 15 : 5;       // 5-15 pts
  const causeScore    = (stats.causeRecurrence?.[cause] || 0) * 15;  // 0-15 pts
  const zoneScore     = (stats.zoneFreq?.[zone]  || 0) * 10;   // 0-10 pts

  return Math.min(Math.round(durScore + closureScore + priorityScore + causeScore + zoneScore), 100);
}

// ─── 4. Shuffle array in-place (Fisher-Yates) ─────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── 5. Stratified subsample ──────────────────────────────────────────────────
function subsample(arr, n) {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
}

// ─── 6. Regression metrics on holdout set ────────────────────────────────────
function computeMetrics(net, testRows) {
  const n = testRows.length;
  if (!n) return { r2: 0, mae: 0, rmse: 0, acc10: 0, acc20: 0 };

  const actuals    = testRows.map(r => r.targetScore);
  const preds      = testRows.map(r => Math.round((net.run(r.input).impact || 0) * 100));

  const meanActual = actuals.reduce((s, v) => s + v, 0) / n;
  let ssTot = 0, ssRes = 0, sumAE = 0, sumSE = 0;
  let within10 = 0, within20 = 0;

  for (let i = 0; i < n; i++) {
    const err = actuals[i] - preds[i];
    ssTot   += (actuals[i] - meanActual) ** 2;
    ssRes   += err ** 2;
    sumAE   += Math.abs(err);
    sumSE   += err ** 2;
    if (Math.abs(err) <= 10) within10++;
    if (Math.abs(err) <= 20) within20++;
  }

  return {
    r2:    ssTot > 0 ? +Math.max(0, 1 - ssRes / ssTot).toFixed(4) : 0,
    mae:   +(sumAE / n).toFixed(2),
    rmse:  +Math.sqrt(sumSE / n).toFixed(2),
    acc10: +(within10 / n * 100).toFixed(1),
    acc20: +(within20 / n * 100).toFixed(1),
    n,
  };
}

// Ensemble prediction (weighted average) for a row
function ensemblePredict(models, inputVec) {
  const totalW = models.reduce((s, m) => s + m.weight, 0);
  const raw = models.reduce((s, m) => {
    return s + (m.net.run(inputVec).impact || 0) * m.weight;
  }, 0);
  return Math.round((raw / totalW) * 100);
}

function computeEnsembleMetrics(models, testRows) {
  const n = testRows.length;
  if (!n) return { r2: 0, mae: 0, rmse: 0, acc10: 0, acc20: 0 };

  const actuals = testRows.map(r => r.targetScore);
  const preds   = testRows.map(r => ensemblePredict(models, r.input));

  const meanActual = actuals.reduce((s, v) => s + v, 0) / n;
  let ssTot = 0, ssRes = 0, sumAE = 0, sumSE = 0;
  let within10 = 0, within20 = 0;

  for (let i = 0; i < n; i++) {
    const err = actuals[i] - preds[i];
    ssTot   += (actuals[i] - meanActual) ** 2;
    ssRes   += err ** 2;
    sumAE   += Math.abs(err);
    sumSE   += err ** 2;
    if (Math.abs(err) <= 10) within10++;
    if (Math.abs(err) <= 20) within20++;
  }

  return {
    r2:    ssTot > 0 ? +Math.max(0, 1 - ssRes / ssTot).toFixed(4) : 0,
    mae:   +(sumAE / n).toFixed(2),
    rmse:  +Math.sqrt(sumSE / n).toFixed(2),
    acc10: +(within10 / n * 100).toFixed(1),
    acc20: +(within20 / n * 100).toFixed(1),
    n,
  };
}

// ─── 7. Main training function ────────────────────────────────────────────────
export async function trainEnsemble(events, stats, onProgress) {
  if (typeof window === 'undefined') return null;
  const { NeuralNetwork } = await import('brain.js');

  // Build feature metadata
  const meta = buildFeatureMeta(events);

  // Build ALL labelled rows (no filter — NULLs are imputed)
  const allRows = events.map(e => ({
    input:       featurize(e, meta),
    output:      { impact: computeTarget(e, meta, stats) / 100 },
    targetScore: computeTarget(e, meta, stats),
  }));

  // Shuffle → 80/20 split
  shuffle(allRows);
  const splitAt  = Math.floor(allRows.length * 0.8);
  const trainAll = allRows.slice(0, splitAt);
  const testRows = allRows.slice(splitAt);

  // Subsample training set (1500 rows for speed)
  const trainSample = subsample(trainAll, 1500);

  // Three model configs
  const CONFIGS = [
    { label: 'Net-A  Wide',   hidden: [24, 12],    lr: 0.02,  iters: 500 },
    { label: 'Net-B  Deep',   hidden: [16, 12, 8], lr: 0.015, iters: 400 },
    { label: 'Net-C  Fast',   hidden: [12],        lr: 0.03,  iters: 600 },
  ];

  const models = [];

  for (let mi = 0; mi < CONFIGS.length; mi++) {
    const cfg = CONFIGS[mi];
    const base = Math.round((mi / CONFIGS.length) * 90);

    onProgress && onProgress(base, `🔧 ${cfg.label} — starting…`, mi, null);

    await new Promise(resolve => setTimeout(() => {
      const net = new NeuralNetwork({
        hiddenLayers: cfg.hidden,
        activation:   'sigmoid',
        learningRate: cfg.lr,
      });

      net.train(trainSample.map(r => ({ input: r.input, output: r.output })), {
        iterations:    cfg.iters,
        errorThresh:   0.008,
        log:           false,
        callback: ({ iterations: iter, error }) => {
          const pct = base + Math.round((iter / cfg.iters) * 30);
          onProgress && onProgress(pct, `🧠 ${cfg.label} — iter ${iter}/${cfg.iters}`, mi, null);
        },
        callbackPeriod: 40,
      });

      const metrics = computeMetrics(net, testRows);
      models.push({ net, label: cfg.label, hidden: cfg.hidden, metrics, weight: 1 });
      onProgress && onProgress(base + 30, `✅ ${cfg.label} done  R²=${metrics.r2}  MAE=${metrics.mae}`, mi, metrics);
      resolve();
    }, 60));
  }

  // Assign ensemble weights ∝ 1/MAE (better model → higher weight)
  const totalInvMAE = models.reduce((s, m) => s + 1 / Math.max(m.metrics.mae, 0.5), 0);
  models.forEach(m => {
    m.weight = (1 / Math.max(m.metrics.mae, 0.5)) / totalInvMAE;
  });

  const ensembleMetrics = computeEnsembleMetrics(models, testRows);

  ensembleState = { models, meta, stats, ensembleMetrics };

  onProgress && onProgress(100, '🎯 Ensemble ready!', 3, ensembleMetrics);
  return ensembleState;
}

// ─── 8. Predict ───────────────────────────────────────────────────────────────
export function predict(rawInputs) {
  if (!ensembleState) throw new Error('Model not trained');
  const { models, meta, stats } = ensembleState;

  // Build a synthetic event from the raw form inputs for featurize()
  const syntheticEvent = {
    start_datetime:       new Date(2024, rawInputs.month - 1, 1, rawInputs.hour, 0),
    zone:                 rawInputs.zone,
    event_cause:          rawInputs.cause,
    junction:             rawInputs.junction || '',
    requires_road_closure: rawInputs.hasClosure,
    priority:             rawInputs.priority,
    event_type:           rawInputs.eventType,
    duration_hours:       rawInputs.duration || null,
  };

  const vec = featurize(syntheticEvent, meta);
  const score = ensemblePredict(models, vec);

  // Confidence range: ±ensemble RMSE
  const rmse = ensembleState.ensembleMetrics.rmse;
  return {
    score,
    low:  Math.max(0,   Math.round(score - rmse)),
    high: Math.min(100, Math.round(score + rmse)),
  };
}

// ─── 9. Feature importance (permutation) ──────────────────────────────────────
export function getFeatureImportance(rawInputs) {
  if (!ensembleState) return [];
  const { models, meta } = ensembleState;

  const syntheticEvent = {
    start_datetime:        new Date(2024, rawInputs.month - 1, 1, rawInputs.hour, 0),
    zone:                  rawInputs.zone,
    event_cause:           rawInputs.cause,
    junction:              rawInputs.junction || '',
    requires_road_closure: rawInputs.hasClosure,
    priority:              rawInputs.priority,
    event_type:            rawInputs.eventType,
    duration_hours:        rawInputs.duration || null,
  };

  const baseVec   = featurize(syntheticEvent, meta);
  const baseScore = ensemblePredict(models, baseVec);

  return FEATURE_KEYS.map(key => {
    const perturbed = { ...baseVec, [key]: 0 };
    const perturbedScore = ensemblePredict(models, perturbed);
    return { feature: key, label: FEATURE_LABELS[key], importance: Math.abs(baseScore - perturbedScore) };
  }).sort((a, b) => b.importance - a.importance);
}

export function isModelTrained()    { return ensembleState !== null; }
export function getEnsembleState()  { return ensembleState; }
