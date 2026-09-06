export function therapistOrigins(profile: { detailAddress?: string; dispatchLocations?: { label?: string; address?: string }[] }, fallback = true): [string, string] {
  const result: [string, string] = ['', ''];
  for (const [index, item] of (profile.dispatchLocations || []).slice(0, 2).entries()) {
    const slot = item.label === '出发地址2' ? 1 : item.label === '出发地址1' ? 0 : index;
    result[slot] = item.address || '';
  }
  if (fallback && !result[0] && !result[1]) result[0] = profile.detailAddress || '';
  return result;
}
