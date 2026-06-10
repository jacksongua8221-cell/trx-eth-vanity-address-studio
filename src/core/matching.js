const DIGIT_SEQUENCE = '0123456789';
const LETTER_SEQUENCE = 'abcde';

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
      return isSuspiciousVanity(chain, address, rule.suspicious);
    default:
      throw new Error(`Unsupported matching mode: ${rule.mode}`);
  }
}

export function isSuspiciousVanity(chain, address, options = {}) {
  const config = normalizeSuspiciousOptions(options);
  if (!config.enabled) return false;

  const comparable = comparableAddress(chain, address);
  if (config.leopardEnabled && hasLeopardSuffix(comparable, config.leopardMinLength)) {
    return true;
  }
  if (config.sequenceEnabled && hasSequenceSuffix(chain, comparable, config.sequenceMinLength)) {
    return true;
  }
  return config.customSuffixes.some((suffix) => suffix && comparable.endsWith(suffix));
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

function normalizeSuspiciousOptions(options = {}) {
  return {
    enabled: options.enabled !== false,
    leopardEnabled: options.leopardEnabled !== false,
    sequenceEnabled: options.sequenceEnabled !== false,
    leopardMinLength: clampLength(options.leopardMinLength, 4),
    sequenceMinLength: clampLength(options.sequenceMinLength, 5),
    customSuffixes: normalizeCustomSuffixes(options.customSuffixes),
  };
}

function clampLength(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(2, Math.min(Math.trunc(parsed), 12));
}

function normalizeCustomSuffixes(values) {
  if (!values) return [];
  const list = Array.isArray(values) ? values : String(values).split(/[\s,，;；]+/);
  return Array.from(new Set(
    list
      .map((value) => String(value).trim().toLowerCase().replace(/^0x/, ''))
      .filter(Boolean)
  ));
}

function hasLeopardSuffix(value, minLength) {
  if (value.length < minLength) return false;
  const tail = value.slice(-minLength);
  return new Set(tail).size === 1;
}

function hasSequenceSuffix(chain, value, minLength) {
  if (value.length < minLength) return false;
  const tail = value.slice(-minLength);
  return DIGIT_SEQUENCE.includes(tail)
    || reverse(DIGIT_SEQUENCE).includes(tail)
    || tail === LETTER_SEQUENCE
    || tail === reverse(LETTER_SEQUENCE);
}

function reverse(value) {
  return Array.from(value).reverse().join('');
}
