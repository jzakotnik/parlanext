// Clientseitig nutzbar (keine Server-Imports)
const STOP = new Set("der die das den dem des ein eine einer eines und oder in im an auf für von zu mit bei aus nach wie was welche welcher welchen wird werden wurde wurden ist sind hat haben seit durch über um als auch nicht sich zur zum".split(" "));
export const tokens = (s: string) =>
  s.toLowerCase().replace(/[^a-zäöüß0-9\s-]/g, " ").split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));
