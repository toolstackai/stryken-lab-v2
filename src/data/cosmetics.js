// Skins de personaje y de arma (originales). price 0 = gratis desde el inicio.
export const RARITY = {
  common:    { name: 'COMMON', color: '#9aa4b5' },
  rare:      { name: 'RARE', color: '#3d8bff' },
  epic:      { name: 'EPIC', color: '#a24dff' },
  legendary: { name: 'LEGENDARY', color: '#ffb321' },
};

// Paleta de cada soldado: camisa, pantalón, chaleco, pasamontañas, gafas, piel, casco, botas, acento.
export const CHAR_SKINS = {
  recruit:  { name: 'RECRUIT', rarity: 'common', price: 0, shirt: 0xc28a5a, pants: 0x9a7b56, vest: 0x5a5440, mask: 0x2b2b2e, goggles: 0xe8e8e8, skin: 0xc68e63, helmet: null, boots: 0x3b3027, accent: 0x7a6a4a },
  urban:    { name: 'URBAN OPS', rarity: 'common', price: 250, shirt: 0x6b7280, pants: 0x4b5260, vest: 0x2f343c, mask: 0x1d1f24, goggles: 0x9ad1ff, skin: 0xb98060, helmet: 0x3a3f48, boots: 0x22252a, accent: 0x8a919c },
  jungle:   { name: 'JUNGLE', rarity: 'rare', price: 600, shirt: 0x4f6b3a, pants: 0x3e5530, vest: 0x2f3d24, mask: 0x2f3d24, goggles: 0xffd166, skin: 0x8d5a3c, helmet: 0x55703d, boots: 0x2a2a1e, accent: 0x9bb36a },
  arctic:   { name: 'ARCTIC', rarity: 'rare', price: 600, shirt: 0xe9eef3, pants: 0xcfd8e2, vest: 0x8fa3b8, mask: 0xf4f6f8, goggles: 0x3fc8e0, skin: 0xe0b08a, helmet: 0xdfe6ee, boots: 0x6c7a89, accent: 0x5c87b0 },
  crimson:  { name: 'CRIMSON', rarity: 'epic', price: 1200, shirt: 0x8e1f25, pants: 0x2a2024, vest: 0x1b1517, mask: 0x161214, goggles: 0xff3b3b, skin: 0xc68e63, helmet: 0x9e242b, boots: 0x161214, accent: 0xff5a4d },
  shadow:   { name: 'SHADOW', rarity: 'epic', price: 1200, shirt: 0x1e2230, pants: 0x161925, vest: 0x0e1018, mask: 0x0b0c12, goggles: 0x7c4dff, skin: 0x7a523a, helmet: 0x1a1d29, boots: 0x0b0c12, accent: 0x7c4dff },
  desert:   { name: 'DESERT FOX', rarity: 'rare', price: 600, shirt: 0xd8b98a, pants: 0xc4a274, vest: 0x8f7650, mask: 0xd8b98a, goggles: 0x2b2b2e, skin: 0xa86f4b, helmet: 0xbfa07a, boots: 0x6b5236, accent: 0xe58a2e },
  neon:     { name: 'NEON RIDER', rarity: 'legendary', price: 3000, shirt: 0x14161f, pants: 0x14161f, vest: 0x262a3a, mask: 0x0d0f16, goggles: 0x29ffd4, skin: 0xc68e63, helmet: 0x1f2333, boots: 0x0d0f16, accent: 0xff2bd6, glow: true },
};

// Camuflajes de arma: color base + patrón procedural (ver textures.js > camoTexture).
export const WEAPON_SKINS = {
  factory:  { name: 'FACTORY', rarity: 'common', price: 0, pattern: 'solid', colors: [0x2a2d33] },
  woodland: { name: 'WOODLAND', rarity: 'common', price: 150, pattern: 'blobs', colors: [0x4a5a32, 0x2f3a22, 0x7a6a42, 0x1e2416] },
  arctic:   { name: 'GLACIER', rarity: 'rare', price: 400, pattern: 'blobs', colors: [0xe8eef4, 0xb9c8d8, 0x8aa0b8, 0xffffff] },
  tiger:    { name: 'TIGER', rarity: 'rare', price: 400, pattern: 'stripes', colors: [0xe0892a, 0x1a1410] },
  digital:  { name: 'DIGITAL', rarity: 'rare', price: 400, pattern: 'pixels', colors: [0x3d4f6b, 0x26334a, 0x6b84a8, 0x1a2333] },
  ocean:    { name: 'DEEP OCEAN', rarity: 'epic', price: 900, pattern: 'waves', colors: [0x0f4c81, 0x1f8fd6, 0x7fd1ff] },
  crimson:  { name: 'CRIMSON WEB', rarity: 'epic', price: 900, pattern: 'web', colors: [0x7d1218, 0x1a0608] },
  toxic:    { name: 'TOXIC', rarity: 'epic', price: 900, pattern: 'pixels', colors: [0x6aff3a, 0x1c3b10, 0x2f6b1a, 0xb6ff8a] },
  gold:     { name: 'ROYAL GOLD', rarity: 'legendary', price: 2500, pattern: 'gold', colors: [0xffc93c, 0xb8860b] },
  neon:     { name: 'NEON GRID', rarity: 'legendary', price: 2500, pattern: 'grid', colors: [0x0b0d1a, 0xff2bd6, 0x29ffd4], glow: true },
  // EXCLUSIVOS (V2): no se venden ni salen en cajas. Sólo se ganan.
  mastery:    { name: 'MASTERY GOLD', rarity: 'legendary', exclusive: 'mastery', how: '500 kills with this weapon', pattern: 'gold', colors: [0xffe27a, 0xc8901a] },
  diamondcut: { name: 'DIAMOND CUT', rarity: 'legendary', exclusive: 'rank', how: 'Reach Diamond in Ranked Arena', pattern: 'pixels', colors: [0x9fe0ff, 0x3a7bd5, 0xe8f7ff, 0x1c3f7a] },
  titanium:   { name: 'TITANIUM', rarity: 'legendary', exclusive: 'rank', how: 'Reach Titanium in Ranked Arena', pattern: 'grid', colors: [0x2a3a52, 0x9fe8ff, 0xffffff], glow: true },
  nightfall:  { name: 'NIGHTFALL', rarity: 'epic', exclusive: 'event', how: 'Weekend event reward track', pattern: 'waves', colors: [0x0b1030, 0x3a2a8a, 0x8a7dff] },
};
