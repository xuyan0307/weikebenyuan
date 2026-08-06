export function shouldClearAccountSearchAutofill(
  value: string,
  currentUsername?: string,
  currentName?: string,
  userHasTyped = false,
): boolean {
  if (userHasTyped) return false;
  const candidate = value.trim().toLocaleLowerCase();
  if (!candidate) return false;

  return [currentUsername, currentName]
    .map(identifier => identifier?.trim().toLocaleLowerCase())
    .filter(Boolean)
    .includes(candidate);
}
