// resourceEngine.js — recommends manpower, barricades, diversion count

const TIERS = [
  { max: 30,  officers: 5,  barricades: 2,  diversionRoutes: 1, label: 'Minimal Response',  color: '#43E97B' },
  { max: 60,  officers: 15, barricades: 6,  diversionRoutes: 2, label: 'Moderate Response', color: '#FFD32A' },
  { max: 80,  officers: 30, barricades: 12, diversionRoutes: 3, label: 'High Response',      color: '#FF6B35' },
  { max: 101, officers: 50, barricades: 20, diversionRoutes: 4, label: 'Critical Response',  color: '#FF4757' },
];

export function getResourceRecommendation(riskScore) {
  const tier = TIERS.find(t => riskScore < t.max) || TIERS[TIERS.length - 1];
  return {
    ...tier,
    riskScore,
    notes: buildNotes(tier, riskScore),
  };
}

function buildNotes(tier, score) {
  const notes = [];
  if (score >= 80) {
    notes.push('Full corridor closure recommended');
    notes.push('Activate Traffic Control Room alert');
    notes.push('Deploy rapid response unit');
  } else if (score >= 60) {
    notes.push('Partial lane closure — maintain 1 open lane');
    notes.push('Set up advance warning signs 500m before zone');
    notes.push('Coordinate with BBMP for quick clearance');
  } else if (score >= 30) {
    notes.push('Monitor situation with patrolling officer');
    notes.push('Place traffic cones on affected lane');
  } else {
    notes.push('Spot observation sufficient');
    notes.push('No road closure required');
  }
  return notes;
}
