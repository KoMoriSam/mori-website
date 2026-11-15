// serverTime describes the response, so it is not part of the published revision.
export const changelogRevision = (payload) =>
  JSON.stringify([payload.schemaVersion, payload.updatedAt, payload.items]);

export const sameChangelog = (left, right) =>
  left?.schemaVersion === 1 && right?.schemaVersion === 1 &&
  Array.isArray(left.items) && Array.isArray(right.items) &&
  changelogRevision(left) === changelogRevision(right);
