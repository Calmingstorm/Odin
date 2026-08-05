/** Resolve a guild behavior toggle against the global default loaded by the page. */
export function guildBehaviorValue(guild, key, globalDefaults) {
  if (guild?.config?.[key] != null) return guild.config[key];
  return globalDefaults?.[key];
}
