const SUSPICIOUS_PATTERNS = [
  /([a-z0-9])\1{2,}/i,
  /(?:111|666|888)/,
  /(?:1111|6666|8888)/,
  /([a-z0-9]{2})\1{2}/i,
  /([a-z0-9])\1\1([a-z0-9])\2\2/i,
  /([a-z0-9])\1([a-z0-9])\2([a-z0-9])\3/i,
  /([a-z0-9]{3})\1/i,
  /123456/,
  /654321/,
];

const ETH_WORDS = ['dead', 'beef', 'cafe', 'face', 'bad', 'feed'];

export function matchesRule(chain, address, rule) {
  const comparable = comparableAddress(chain, address);
  const targets = normalizeRuleTargets(rule);

  if (!hasAnyTarget(targets) && rule.mode !== 'smart') {
    return false;
  }

  switch (rule.mode) {
    case 'prefix':
      return comparable.startsWith(targets.prefix);
    case 'suffix':
      return comparable.endsWith(targets.suffix);
    case 'contains':
      return comparable.includes(targets.contains);
    case 'prefix_suffix':
      return comparable.startsWith(targets.prefix) && comparable.endsWith(targets.suffix);
    case 'prefix_contains':
      return comparable.startsWith(targets.prefix) && comparable.includes(targets.contains);
    case 'contains_suffix':
      return comparable.includes(targets.contains) && comparable.endsWith(targets.suffix);
    case 'prefix_contains_suffix':
      return comparable.startsWith(targets.prefix)
        && comparable.includes(targets.contains)
        && comparable.endsWith(targets.suffix);
    case 'smart':
      return isSuspiciousVanity(chain, address);
    default:
      throw new Error(`Unsupported matching mode: ${rule.mode}`);
  }
}

export function isSuspiciousVanity(chain, address) {
  const comparable = comparableAddress(chain, address);
  if (SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(comparable))) {
    return true;
  }
  return chain.toUpperCase() === 'ETH' && ETH_WORDS.some((word) => comparable.includes(word));
}

export function computeDifficulty(chain, rule) {
  const normalizedChain = chain.toUpperCase();
  const targets = normalizeRuleTargets(rule);
  const alphabetSize = normalizedChain === 'TRX' ? 58 : 16;

  if (rule.mode === 'smart') {
    return { probability: 1 / 10000, difficulty: 10000, alphabetSize };
  }

  if (!hasAnyTarget(targets)) {
    return { probability: 0, difficulty: Infinity, alphabetSize };
  }

  const addressLength = comparableAddressLength(normalizedChain);
  let probability = 1;
  if (targets.prefix) {
    probability *= 1 / alphabetSize ** targets.prefix.length;
  }
  if (targets.suffix) {
    probability *= 1 / alphabetSize ** targets.suffix.length;
  }
  if (targets.contains) {
    const windowCount = Math.max(1, addressLength - targets.contains.length + 1);
    probability *= Math.min(1, windowCount / alphabetSize ** targets.contains.length);
  }

  return {
    probability,
    difficulty: 1 / probability,
    alphabetSize,
  };
}

export function cumulativeHitProbability(singleAttemptProbability, attempts) {
  if (!Number.isFinite(singleAttemptProbability) || singleAttemptProbability <= 0) {
    return 0;
  }
  return 1 - (1 - singleAttemptProbability) ** attempts;
}

export function estimateHitTimes(difficulty, speed) {
  if (!Number.isFinite(difficulty) || speed <= 0) {
    return { averageMs: Infinity, p50Ms: Infinity, p90Ms: Infinity, p99Ms: Infinity };
  }
  const p = 1 / difficulty;
  return {
    averageMs: (difficulty / speed) * 1000,
    p50Ms: (Math.log(1 - 0.5) / Math.log(1 - p) / speed) * 1000,
    p90Ms: (Math.log(1 - 0.9) / Math.log(1 - p) / speed) * 1000,
    p99Ms: (Math.log(1 - 0.99) / Math.log(1 - p) / speed) * 1000,
  };
}

export function comparableAddress(chain, address) {
  const normalized = String(address).toLowerCase();
  if (chain.toUpperCase() === 'ETH') {
    return normalized.replace(/^0x/, '');
  }
  if (chain.toUpperCase() === 'TRX') {
    return normalized.slice(1);
  }
  return normalized;
}

function comparableAddressLength(chain) {
  return chain === 'TRX' ? 33 : 40;
}

export function normalizeRuleTargets(rule) {
  const target = String(rule.target ?? '').trim().toLowerCase();
  const prefix = String(rule.prefix ?? '').trim().toLowerCase();
  const contains = String(rule.contains ?? '').trim().toLowerCase();
  const suffix = String(rule.suffix ?? '').trim().toLowerCase();

  if (rule.mode === 'prefix') return { prefix: prefix || target, contains: '', suffix: '' };
  if (rule.mode === 'contains') return { prefix: '', contains: contains || target, suffix: '' };
  if (rule.mode === 'suffix') return { prefix: '', contains: '', suffix: suffix || target };
  return { prefix, contains, suffix };
}

function hasAnyTarget(targets) {
  return Boolean(targets.prefix || targets.contains || targets.suffix);
}
