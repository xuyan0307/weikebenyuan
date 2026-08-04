import { createHash } from 'crypto';
import { parseJson } from '../utils/serialization';

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonObject;
}

function recordList(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter(item => objectValue(item) !== null) as JsonObject[]
    : [];
}

function recordFingerprint(record: JsonObject): string {
  return JSON.stringify([
    record.date || '',
    record.content || '',
    record.feedback || '',
    record.status || '',
    record.operator || '',
    record.followerId || '',
    record.followerName || '',
    record.createdAt || '',
  ]);
}

function stableRevisionId(record: JsonObject) {
  const digest = createHash('sha256').update(recordFingerprint(record)).digest('hex').slice(0, 16);
  return `follow-revision-${digest}`;
}

/**
 * Follow records are business evidence. Existing entries are immutable: new payloads may append
 * records, but can never delete or overwrite a previously persisted entry.
 */
export function mergeAppendOnlyFollowRecords(existingValue: unknown, incomingValue: unknown): JsonObject[] {
  const existing = recordList(existingValue);
  const incoming = recordList(incomingValue);
  const result = existing.map(record => ({ ...record }));
  const fingerprints = new Set(result.map(recordFingerprint));
  const ids = new Set(result.map(record => String(record.id || '')).filter(Boolean));

  for (const source of incoming) {
    const fingerprint = recordFingerprint(source);
    if (fingerprints.has(fingerprint)) continue;
    const record = { ...source };
    const requestedId = String(record.id || '').trim();
    if (!requestedId || ids.has(requestedId)) record.id = stableRevisionId(record);
    const finalId = String(record.id || '');
    if (ids.has(finalId)) continue;
    result.push(record);
    ids.add(finalId);
    fingerprints.add(fingerprint);
  }

  return result.sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')));
}

export function mergeCustomerProfileFollowHistory(existingValue: unknown, incomingValue: unknown): JsonObject {
  const existing = parseJson<JsonObject>(existingValue, {});
  const incoming = parseJson<JsonObject>(incomingValue, {});
  return {
    ...existing,
    ...incoming,
    followRecords: mergeAppendOnlyFollowRecords(existing.followRecords, incoming.followRecords),
  };
}

function mergeStageHistory(existingStage: JsonObject | null, incomingStage: JsonObject): JsonObject {
  if (!existingStage) return { ...incomingStage };
  return {
    ...incomingStage,
    followRecords: mergeAppendOnlyFollowRecords(existingStage.followRecords, incomingStage.followRecords),
  };
}

export function mergeOrderFollowHistory(existingValue: unknown, incomingValue: unknown): JsonObject {
  const existing = parseJson<JsonObject>(existingValue, {});
  const incoming = parseJson<JsonObject>(incomingValue, {});
  const merged: JsonObject = {
    ...existing,
    ...incoming,
    followRecords: mergeAppendOnlyFollowRecords(existing.followRecords, incoming.followRecords),
  };

  const incomingExperience = objectValue(incoming.experienceSnapshot);
  const existingExperience = objectValue(existing.experienceSnapshot);
  if (incomingExperience) {
    merged.experienceSnapshot = mergeStageHistory(existingExperience, incomingExperience);
  }

  if (Array.isArray(incoming.packageHistory)) {
    const existingStages = recordList(existing.packageHistory);
    merged.packageHistory = recordList(incoming.packageHistory).map(stage => {
      const stageKey = String(stage.id || stage.label || '');
      const previous = existingStages.find(item => String(item.id || item.label || '') === stageKey) || null;
      return mergeStageHistory(previous, stage);
    });
  }

  return merged;
}
