const WORDS = ["Tiger", "Mango", "River", "Cloud", "Lotus", "Eagle", "Maple", "Tulsi", "Peace", "Hills", "Sunny", "Ocean", "Rhino", "Panda", "Star"];

/** A password that's easy to read out or send to a parent, e.g. "Mango4821". */
export function generatePassword(): string {
  const values = crypto.getRandomValues(new Uint32Array(2));
  return `${WORDS[values[0] % WORDS.length]}${String(1000 + (values[1] % 9000))}`;
}

/** The text a school sends a parent with their app login. */
export function loginDetailsText(schoolName: string, schoolCode: string, login: string, password?: string) {
  return [
    `${schoolName} — parent app login`,
    `School code: ${schoolCode}`,
    `Mobile / email: ${login}`,
    password ? `Password: ${password}` : null,
    "Download the school app and sign in with these details.",
  ]
    .filter(Boolean)
    .join("\n");
}
